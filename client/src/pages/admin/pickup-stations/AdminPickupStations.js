import styles from './adminPickupStations.module.css';
import {useState} from "react";
import {Link} from "react-router-dom";
import {useQuery} from "@tanstack/react-query";
import * as api from "../../../api";
import {queryClient} from "../../../index";
import AdminLayout from "../../../components/admin-layout/AdminLayout";
import TablePagination from "../../../components/table-pagination/TablePagination";
import Loading from "../../../components/loading/Loading";

const emptyForm = {
    name: "",
    city: "Nairobi",
    area: "",
    street: "",
    landmark: "",
    phone: "0711 234 500",
    opening_hours: "Mon–Sun: 7:00 AM – 9:00 PM",
    lat: "-1.286389",
    lng: "36.817223",
    active: true,
};

const AdminPickupStations = () => {
    const [form, setForm] = useState(emptyForm);
    const [editingId, setEditingId] = useState(null);
    const [mapSearch, setMapSearch] = useState("");
    const [searchingMap, setSearchingMap] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [feedback, setFeedback] = useState("");
    const [error, setError] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(5);

    const {data: stations = [], isPending} = useQuery({
        queryKey: ['pickupStations'],
        queryFn: async () => {
            const res = await api.fetchPickupStations();
            return res.data || [];
        },
        staleTime: 0,
        refetchOnMount: 'always',
    });

    const handleChange = (e) => {
        const {name, value, type, checked} = e.target;
        setForm((prev) => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value,
        }));
    };

    const handleDetectGps = () => {
        if (!navigator.geolocation) {
            return setError("Geolocation is not supported by your browser.");
        }
        setError("");
        setFeedback("Detecting GPS coordinates...");
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const lat = pos.coords.latitude.toFixed(6);
                const lng = pos.coords.longitude.toFixed(6);
                setForm((prev) => ({...prev, lat, lng}));
                setFeedback(`✓ GPS Coordinates detected (${lat}, ${lng})`);

                try {
                    const res = await fetch(
                        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
                    );
                    const geo = await res.json();
                    const addr = geo?.address || {};
                    setForm((prev) => ({
                        ...prev,
                        city: addr.city || addr.town || addr.county || prev.city,
                        area: addr.suburb || addr.neighbourhood || addr.residential || prev.area,
                        street: addr.road || geo.display_name?.split(',')[0] || prev.street,
                        lat,
                        lng,
                    }));
                } catch {
                    // keep coordinates
                }
            },
            () => {
                setFeedback("");
                setError("Unable to retrieve GPS location. Please allow location access.");
            },
            {enableHighAccuracy: true, timeout: 10000}
        );
    };

    const handleSearchPlace = async () => {
        if (!mapSearch.trim()) return;
        setSearchingMap(true);
        setError("");
        try {
            const res = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
                    mapSearch.trim()
                )}&limit=1`
            );
            const results = await res.json();
            if (Array.isArray(results) && results.length > 0) {
                const top = results[0];
                const lat = Number(top.lat).toFixed(6);
                const lng = Number(top.lon).toFixed(6);
                const parts = (top.display_name || "").split(",").map((s) => s.trim());
                setForm((prev) => ({
                    ...prev,
                    name: prev.name || `KijaniMart ${parts[0]} Station`,
                    area: prev.area || parts[0] || "",
                    street: prev.street || parts.slice(0, 2).join(", ") || "",
                    lat,
                    lng,
                }));
                setFeedback(`✓ Pinned "${parts[0]}" on Google Map (${lat}, ${lng})`);
            } else {
                setError("Could not find coordinates for that place name. Try adding 'Kenya'.");
            }
        } catch {
            setError("Map search failed. You can also enter coordinates directly.");
        } finally {
            setSearchingMap(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.name.trim() || !form.area.trim() || !form.street.trim()) {
            return setError("Station Name, Area, and Street are required.");
        }

        setSubmitting(true);
        setError("");
        setFeedback("");

        try {
            const payload = {
                ...form,
                lat: Number(form.lat || -1.286389),
                lng: Number(form.lng || 36.817223),
                coordinates: {
                    lat: Number(form.lat || -1.286389),
                    lng: Number(form.lng || 36.817223),
                },
            };

            if (editingId) {
                await api.updatePickupStation(editingId, payload);
                setFeedback("✓ Pickup station updated successfully!");
            } else {
                await api.createPickupStation(payload);
                setFeedback("✓ New pickup station created!");
            }

            setForm(emptyForm);
            setEditingId(null);
            queryClient.invalidateQueries({queryKey: ['pickupStations']});
        } catch (err) {
            setError(err.response?.data?.message || "Failed to save pickup station.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleEdit = (station) => {
        setEditingId(station.station_id || station._id);
        setForm({
            name: station.name || "",
            city: station.city || "Nairobi",
            area: station.area || "",
            street: station.street || "",
            landmark: station.landmark || "",
            phone: station.phone || "",
            opening_hours: station.opening_hours || "Mon–Sun: 7:00 AM – 9:00 PM",
            lat: String(station.coordinates?.lat ?? -1.286389),
            lng: String(station.coordinates?.lng ?? 36.817223),
            active: station.active !== false,
        });
        window.scrollTo({top: 0, behavior: 'smooth'});
    };

    const handleDelete = async (station) => {
        const id = station.station_id || station._id;
        try {
            await api.deletePickupStation(id);
            setFeedback(`Deleted "${station.name}"`);
            queryClient.invalidateQueries({queryKey: ['pickupStations']});
        } catch (err) {
            setError(err.response?.data?.message || "Failed to delete station.");
        }
    };

    const mapEmbedUrl = `https://maps.google.com/maps?q=${encodeURIComponent(
        `${form.lat || -1.286389},${form.lng || 36.817223}`
    )}&z=15&output=embed`;

    return (
        <AdminLayout
            title="Manage Pickup Stations"
            subtitle="Configure customer pickup hubs, opening hours, and GPS / Google Map locations."
        >
            {feedback && <div className={styles['ok-banner']}>{feedback}</div>}
            {error && <div className={styles['err-banner']}>{error}</div>}

            <div className={styles['main-grid']}>
                {/* Left Column: Add / Edit Pickup Station Form */}
                <form onSubmit={handleSubmit} className={styles['form-card']}>
                    <h2>{editingId ? "Edit Pickup Station" : "Add New Pickup Station"}</h2>

                    <div className={styles['map-tools']}>
                        <button
                            type="button"
                            onClick={handleDetectGps}
                            className={styles['gps-btn']}
                        >
                            <span className="material-symbols-outlined">my_location</span>
                            <span>Use My Current GPS</span>
                        </button>

                        <div className={styles['search-row']}>
                            <input
                                type="text"
                                value={mapSearch}
                                onChange={(e) => setMapSearch(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleSearchPlace())}
                                placeholder="Search location on Google Map (e.g. Westlands, Nairobi)"
                            />
                            <button
                                type="button"
                                onClick={handleSearchPlace}
                                disabled={searchingMap}
                            >
                                {searchingMap ? "..." : "Pin"}
                            </button>
                        </div>
                    </div>

                    <div className={styles['field']}>
                        <label>Pickup Station Name *</label>
                        <input
                            name="name"
                            value={form.name}
                            onChange={handleChange}
                            placeholder="e.g. KijaniMart Westlands Hub"
                            required
                        />
                    </div>

                    <div className={styles['row-2']}>
                        <div className={styles['field']}>
                            <label>City *</label>
                            <input
                                name="city"
                                value={form.city}
                                onChange={handleChange}
                                placeholder="Nairobi"
                                required
                            />
                        </div>
                        <div className={styles['field']}>
                            <label>Area / Estate *</label>
                            <input
                                name="area"
                                value={form.area}
                                onChange={handleChange}
                                placeholder="Westlands"
                                required
                            />
                        </div>
                    </div>

                    <div className={styles['field']}>
                        <label>Street / Building Address *</label>
                        <input
                            name="street"
                            value={form.street}
                            onChange={handleChange}
                            placeholder="Karuna Road, Ground Floor"
                            required
                        />
                    </div>

                    <div className={styles['row-2']}>
                        <div className={styles['field']}>
                            <label>Landmark</label>
                            <input
                                name="landmark"
                                value={form.landmark}
                                onChange={handleChange}
                                placeholder="Opposite Sarit Centre"
                            />
                        </div>
                        <div className={styles['field']}>
                            <label>Station Contact Phone</label>
                            <input
                                name="phone"
                                value={form.phone}
                                onChange={handleChange}
                                placeholder="0711 234 500"
                            />
                        </div>
                    </div>

                    <div className={styles['field']}>
                        <label>Opening Hours</label>
                        <input
                            name="opening_hours"
                            value={form.opening_hours}
                            onChange={handleChange}
                            placeholder="Mon–Sun: 7:00 AM – 9:00 PM"
                        />
                    </div>

                    <div className={styles['row-2']}>
                        <div className={styles['field']}>
                            <label>Latitude (GPS)</label>
                            <input
                                name="lat"
                                value={form.lat}
                                onChange={handleChange}
                                placeholder="-1.286389"
                            />
                        </div>
                        <div className={styles['field']}>
                            <label>Longitude (GPS)</label>
                            <input
                                name="lng"
                                value={form.lng}
                                onChange={handleChange}
                                placeholder="36.817223"
                            />
                        </div>
                    </div>

                    <div className={styles['map-preview']}>
                        <iframe
                            title="Station Google Map Preview"
                            src={mapEmbedUrl}
                            width="100%"
                            height="185"
                            style={{border: 0}}
                            loading="lazy"
                        />
                    </div>

                    <div className={styles['btn-row']}>
                        <button type="submit" disabled={submitting} className="btn1">
                            {submitting
                                ? "Saving..."
                                : editingId
                                ? "Update Pickup Station"
                                : "Create Pickup Station"}
                        </button>
                        {editingId && (
                            <button
                                type="button"
                                onClick={() => {
                                    setEditingId(null);
                                    setForm(emptyForm);
                                }}
                                className={styles['cancel-btn']}
                            >
                                Cancel
                            </button>
                        )}
                    </div>
                </form>

                {/* Right Column: Existing Stations List */}
                <div className={styles['stations-col']}>
                    <h2>Configured Pickup Stations ({stations.length})</h2>
                    {isPending ? (
                        <Loading/>
                    ) : (
                        <>
                            <div className={styles['stations-list']}>
                                {stations
                                    .slice(
                                        (currentPage - 1) * rowsPerPage,
                                        currentPage * rowsPerPage
                                    )
                                    .map((st) => (
                                        <div
                                            key={st.station_id || st._id}
                                            className={styles['station-card']}
                                        >
                                            <div className={styles['station-head']}>
                                                <div>
                                                    <span className={styles['city-badge']}>
                                                        {st.city} • {st.area}
                                                    </span>
                                                    <h3>{st.name}</h3>
                                                </div>
                                                <span className={styles['coord-chip']}>
                                                    📍{' '}
                                                    {Number(st.coordinates?.lat || -1.28).toFixed(
                                                        4
                                                    )}
                                                    ,{' '}
                                                    {Number(st.coordinates?.lng || 36.82).toFixed(
                                                        4
                                                    )}
                                                </span>
                                            </div>

                                            <p className={styles['station-addr']}>
                                                {st.street}{' '}
                                                {st.landmark ? `• (${st.landmark})` : ''}
                                            </p>

                                            <div className={styles['station-meta']}>
                                                <span>🕒 {st.opening_hours}</span>
                                                <span>📞 {st.phone}</span>
                                            </div>

                                            <div className={styles['station-actions']}>
                                                <button
                                                    type="button"
                                                    onClick={() => handleEdit(st)}
                                                    className={styles['edit-btn']}
                                                >
                                                    Edit Station
                                                </button>
                                                <a
                                                    href={`https://www.google.com/maps/search/?api=1&query=${st.coordinates?.lat},${st.coordinates?.lng}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className={styles['map-link']}
                                                >
                                                    Open in Google Maps ↗
                                                </a>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDelete(st)}
                                                    className={styles['del-btn']}
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                            </div>

                            <TablePagination
                                totalItems={stations.length}
                                currentPage={currentPage}
                                rowsPerPage={rowsPerPage}
                                onPageChange={setCurrentPage}
                                onRowsPerPageChange={setRowsPerPage}
                                itemLabel="pickup stations"
                            />
                        </>
                    )}
                </div>
            </div>
        </AdminLayout>
    );
};

export default AdminPickupStations;
