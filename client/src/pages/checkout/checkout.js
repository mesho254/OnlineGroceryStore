import styles from './checkout.module.css';
import '../../shared/css/master.css';
import {useEffect, useRef, useState} from "react";
import {useDispatch, useSelector} from "react-redux";
import {Link, Navigate} from "react-router-dom";
import {useQuery} from "@tanstack/react-query";
import Error from "../../components/feedback/error/Error";
import {postOrder} from "../../actions/orders";
import * as api from "../../api";
import {formatKES, getEffectivePrice} from "../../utils/pricing";

const Checkout = () => {
    const dispatch = useDispatch();
    const user = useSelector((state) => state.authentication.user);
    const cart = useSelector((state) => state.products.cart_validation);

    const [error, setError] = useState('');
    const [locationNotice, setLocationNotice] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const isSubmittingRef = useRef(false);

    // Contact Info (pre-filled from logged-in user)
    const [firstName, setFirstName] = useState(user?.first_name || "");
    const [lastName, setLastName] = useState(user?.last_name || "");
    const [email, setEmail] = useState(user?.email || "");
    const [phone, setPhone] = useState(user?.phone || "");

    // Delivery Mode: "DOORSTEP" | "PICKUP_STATION"
    const [deliveryMethod, setDeliveryMethod] = useState("DOORSTEP");

    // Doorstep Location State
    const [city, setCity] = useState("Nairobi");
    const [area, setArea] = useState("");
    const [street, setStreet] = useState("");
    const [buildingNumber, setBuildingNumber] = useState("");
    const [floor, setFloor] = useState("");
    const [apartmentNumber, setApartmentNumber] = useState("");
    const [lat, setLat] = useState("-1.286389");
    const [lng, setLng] = useState("36.817223");

    // Google Map Search State
    const [mapSearchQuery, setMapSearchQuery] = useState("");
    const [searchingPlace, setSearchingPlace] = useState(false);
    const [detectingGps, setDetectingGps] = useState(false);

    // Pickup Station State
    const [selectedCityFilter, setSelectedCityFilter] = useState("All");
    const [selectedStation, setSelectedStation] = useState(null);

    const {data: pickupStations = []} = useQuery({
        queryKey: ['pickupStations'],
        queryFn: async () => {
            const res = await api.fetchPickupStations();
            return (res.data || []).filter((s) => s.active !== false);
        },
        staleTime: 0,
        refetchOnMount: 'always',
    });

    const checkoutCartItems = Array.isArray(cart?.cart) ? cart.cart : [];
    const checkoutProductIds = Array.from(
        new Set(checkoutCartItems.map((i) => i.product_id).filter(Boolean))
    );
    const checkoutStockKey = checkoutProductIds.join(',');

    // Continuously verify live stock while shopper fills out checkout form
    const {data: checkoutLiveStockMap = {}, refetch: refetchCheckoutStock} = useQuery({
        queryKey: ['checkoutLiveStock', checkoutStockKey, cart?.checkout_token_id || ''],
        queryFn: async () => {
            const res = await api.checkProductsStock(
                checkoutProductIds,
                cart?.checkout_token_id || null
            );
            const list = res.data?.products || [];
            return list.reduce((acc, p) => {
                acc[p.product_id] = p;
                return acc;
            }, {});
        },
        enabled: Boolean(cart?.token) && checkoutProductIds.length > 0,
        staleTime: 0,
        refetchOnMount: 'always',
        refetchOnWindowFocus: true,
        refetchInterval: 10000,
    });

    const checkoutStockIssues = checkoutCartItems.reduce((issues, item) => {
        const live = checkoutLiveStockMap[item.product_id];
        if (!live) return issues;
        const qty = Number(item.quantity || 1);
        const totalStock = Number(live.stock || 0);
        const avail = Number(live.available_stock ?? totalStock);
        const reserved = Number(live.reserved_stock || 0);

        if (totalStock <= 0) {
            issues.push({
                product_id: item.product_id,
                message: `"${live.name || item.name}" just sold out (another shopper purchased the last unit).`,
            });
        } else if (avail <= 0 && reserved > 0) {
            issues.push({
                product_id: item.product_id,
                message: `The last unit(s) of "${live.name || item.name}" are currently reserved in another shopper's active checkout.`,
            });
        } else if (qty > avail) {
            issues.push({
                product_id: item.product_id,
                message: `Only ${avail} unit(s) of "${live.name || item.name}" remain (you requested ${qty}).`,
            });
        }
        return issues;
    }, []);

    const hasCheckoutStockBlock = checkoutStockIssues.length > 0;

    useEffect(() => {
        if (!selectedStation && pickupStations.length > 0) {
            setSelectedStation(pickupStations[0]);
        }
    }, [pickupStations, selectedStation]);

    if (!cart || !cart.token) {
        return <Navigate to="/cart" replace/>;
    }

    const reverseGeocodeCoordinates = async (latVal, lngVal) => {
        try {
            const res = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latVal}&lon=${lngVal}`
            );
            const geo = await res.json();
            const addr = geo?.address || {};
            const resolvedCity =
                addr.city || addr.town || addr.municipality || addr.county || city || "Nairobi";
            const resolvedArea =
                addr.suburb ||
                addr.neighbourhood ||
                addr.residential ||
                addr.quarter ||
                addr.village ||
                area ||
                "Central";
            const resolvedStreet =
                addr.road ||
                addr.pedestrian ||
                (geo.display_name ? geo.display_name.split(",").slice(0, 2).join(", ") : "") ||
                street ||
                `Pinned GPS (${latVal}, ${lngVal})`;

            setCity(resolvedCity);
            setArea(resolvedArea);
            setStreet(resolvedStreet);
            setLocationNotice(
                `✓ Location set to ${resolvedArea}, ${resolvedCity} (${latVal}, ${lngVal})`
            );
        } catch {
            setCity((prev) => prev || "Nairobi");
            setArea((prev) => prev || "GPS Pinned Zone");
            setStreet((prev) => prev || `Coordinates: ${latVal}, ${lngVal}`);
            setLocationNotice(`✓ Coordinates applied (${latVal}, ${lngVal})`);
        }
    };

    const handleDetectGps = () => {
        if (!navigator.geolocation) {
            return setError("GPS Geolocation is not supported by your browser.");
        }
        setDetectingGps(true);
        setError("");
        setLocationNotice("Detecting your live GPS location...");

        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const detectedLat = pos.coords.latitude.toFixed(6);
                const detectedLng = pos.coords.longitude.toFixed(6);
                setLat(detectedLat);
                setLng(detectedLng);
                await reverseGeocodeCoordinates(detectedLat, detectedLng);
                setDetectingGps(false);
            },
            () => {
                setDetectingGps(false);
                setLocationNotice("");
                setError(
                    "Could not access GPS location. Please allow browser location access or search on the map / enter coordinates."
                );
            },
            {enableHighAccuracy: true, timeout: 10000}
        );
    };

    const handleSearchPlaceOnMap = async () => {
        if (!mapSearchQuery.trim()) return;
        setSearchingPlace(true);
        setError("");

        try {
            const res = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
                    mapSearchQuery.trim()
                )}&limit=1`
            );
            const results = await res.json();
            if (Array.isArray(results) && results.length > 0) {
                const match = results[0];
                const foundLat = Number(match.lat).toFixed(6);
                const foundLng = Number(match.lon).toFixed(6);
                setLat(foundLat);
                setLng(foundLng);
                await reverseGeocodeCoordinates(foundLat, foundLng);
            } else {
                setError("Location not found on map. Try including the city or 'Kenya'.");
            }
        } catch {
            setError("Map search unavailable. You can still enter coordinates or address below.");
        } finally {
            setSearchingPlace(false);
        }
    };

    const handleApplyCoordinates = async () => {
        const parsedLat = parseFloat(lat);
        const parsedLng = parseFloat(lng);
        if (isNaN(parsedLat) || isNaN(parsedLng)) {
            return setError("Please enter valid numeric Latitude and Longitude coordinates.");
        }
        setError("");
        await reverseGeocodeCoordinates(parsedLat.toFixed(6), parsedLng.toFixed(6));
    };

    const validatePhone = (val) => {
        const digits = String(val).replace(/\s+/g, '');
        return /^\+?\d{9,13}$/.test(digits);
    };

    const validateEmail = (val) => {
        return String(val)
            .toLowerCase()
            .match(
                /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
            );
    };

    const handleCheckout = async () => {
        // Synchronous ref lock prevents double-click race conditions within the same render frame
        if (isSubmittingRef.current || submitting) return;

        if (hasCheckoutStockBlock) {
            return setError(checkoutStockIssues[0].message);
        }

        if (!firstName.trim()) return setError("Please enter your first name.");
        if (!lastName.trim()) return setError("Please enter your last name.");
        if (!email.trim() || !validateEmail(email.trim()))
            return setError("Please enter a valid email address.");
        if (!phone.trim() || !validatePhone(phone.trim()))
            return setError("Please enter a valid phone number (e.g. 0712345678).");

        let finalAddressPayload;

        if (deliveryMethod === "PICKUP_STATION") {
            if (!selectedStation) {
                return setError("Please select a pickup station.");
            }
            const stLat = selectedStation.coordinates?.lat ?? -1.286389;
            const stLng = selectedStation.coordinates?.lng ?? 36.817223;
            finalAddressPayload = {
                delivery_method: "PICKUP_STATION",
                country: "Kenya",
                city: selectedStation.city || "Nairobi",
                area: selectedStation.area || "",
                street: `${selectedStation.name} — ${selectedStation.street}`,
                building_number: selectedStation.landmark || "Pickup Hub",
                floor: "",
                apartment_number: "",
                formatted_address: `Pickup Station: ${selectedStation.name}, ${selectedStation.street}, ${selectedStation.area}, ${selectedStation.city}`,
                google_maps_url: `https://www.google.com/maps/search/?api=1&query=${stLat},${stLng}`,
                coordinates: {
                    lat: Number(stLat),
                    lng: Number(stLng),
                },
                pickup_station: {
                    station_id: selectedStation.station_id || selectedStation._id,
                    name: selectedStation.name,
                    landmark: selectedStation.landmark,
                    opening_hours: selectedStation.opening_hours,
                    phone: selectedStation.phone,
                },
            };
        } else {
            if (!city.trim()) return setError("Please enter your city or use GPS/Map.");
            if (!area.trim()) return setError("Please enter your area/estate or use GPS/Map.");
            if (!street.trim()) return setError("Please enter your street/landmark or use GPS/Map.");

            const numLat = Number(lat) || -1.286389;
            const numLng = Number(lng) || 36.817223;

            finalAddressPayload = {
                delivery_method: "DOORSTEP",
                country: "Kenya",
                city: city.trim(),
                area: area.trim(),
                street: street.trim(),
                building_number: buildingNumber.trim() || "N/A",
                floor: floor.trim() || "",
                apartment_number: apartmentNumber.trim() || "",
                formatted_address: `${street.trim()}, ${area.trim()}, ${city.trim()} (${numLat}, ${numLng})`,
                google_maps_url: `https://www.google.com/maps/search/?api=1&query=${numLat},${numLng}`,
                coordinates: {
                    lat: numLat,
                    lng: numLng,
                },
            };
        }

        isSubmittingRef.current = true;
        setSubmitting(true);
        setError("");

        // Final real-time stock verification right before creating Stripe session
        try {
            const freshRes = await api.checkProductsStock(
                checkoutProductIds,
                cart?.checkout_token_id || null
            );
            const freshMap = (freshRes.data?.products || []).reduce((acc, p) => {
                acc[p.product_id] = p;
                return acc;
            }, {});
            for (const item of checkoutCartItems) {
                const live = freshMap[item.product_id];
                if (!live) continue;
                const qty = Number(item.quantity || 1);
                if (Number(live.stock || 0) <= 0) {
                    isSubmittingRef.current = false;
                    setSubmitting(false);
                    refetchCheckoutStock();
                    return setError(
                        `"${live.name || item.name}" just sold out! Another shopper bought the last item — please return to your cart.`
                    );
                }
                if (Number(live.available_stock ?? 0) < qty) {
                    isSubmittingRef.current = false;
                    setSubmitting(false);
                    refetchCheckoutStock();
                    return setError(
                        Number(live.reserved_stock || 0) > 0 && Number(live.available_stock ?? 0) <= 0
                            ? `The last unit(s) of "${live.name || item.name}" are reserved in another shopper's active checkout. Please try again shortly.`
                            : `Only ${live.available_stock} unit(s) of "${live.name || item.name}" left in stock (requested ${qty}). Please return to your cart.`
                    );
                }
            }
        } catch {
            // Server POST /payments also enforces live stock atomically
        }

        const onSuccess = (url) => {
            window.location.href = url;
        };

        const onError = (e) => {
            isSubmittingRef.current = false;
            setSubmitting(false);
            refetchCheckoutStock();
            setError(e.response?.data?.message || e.message || "Checkout failed.");
        };

        const payloadData = {
            name: {
                first: firstName.trim(),
                last: lastName.trim(),
            },
            email: email.trim(),
            phone_number: phone.trim(),
            address: finalAddressPayload,
        };

        dispatch(postOrder(cart.token, payloadData, onSuccess, onError));
    };

    const activeLat =
        deliveryMethod === "PICKUP_STATION" && selectedStation
            ? selectedStation.coordinates?.lat ?? -1.286389
            : lat || -1.286389;
    const activeLng =
        deliveryMethod === "PICKUP_STATION" && selectedStation
            ? selectedStation.coordinates?.lng ?? 36.817223
            : lng || 36.817223;

    const googleMapEmbedUrl = `https://maps.google.com/maps?q=${encodeURIComponent(
        `${activeLat},${activeLng}`
    )}&z=15&output=embed`;

    const availableCities = [
        "All",
        ...Array.from(new Set(pickupStations.map((s) => s.city).filter(Boolean))),
    ];
    const filteredStations =
        selectedCityFilter === "All"
            ? pickupStations
            : pickupStations.filter((s) => s.city === selectedCityFilter);

    const cartItems = Array.isArray(cart.cart) ? cart.cart : [];

    return (
        <div className={styles['wrapper']}>
            {error && <Error error={error} setError={setError}/>}

            <div className={styles['page-head']}>
                <div>
                    <span className={styles['eyebrow']}>SECURE EXPRESS CHECKOUT</span>
                    <h1>Complete Your Order</h1>
                </div>
                <Link to="/cart" className={styles['back-cart']}>
                    ← Back to Cart
                </Link>
            </div>

            <div className={styles['checkout-grid']}>
                {/* Left Column: Customer Contact & Location / Pickup Selector */}
                <div className={styles['left-col']}>
                    {/* Step 1: Contact Information */}
                    <section className={styles['card']}>
                        <div className={styles['card-head']}>
                            <span className={styles['step-num']}>1</span>
                            <div>
                                <h2>Contact Information</h2>
                                <p>We&apos;ll send your order confirmation and delivery updates here.</p>
                            </div>
                        </div>

                        <div className={styles['row-2']}>
                            <div className={styles['field']}>
                                <label>First Name *</label>
                                <input
                                    type="text"
                                    value={firstName}
                                    onChange={(e) => setFirstName(e.target.value)}
                                    placeholder="First Name"
                                />
                            </div>
                            <div className={styles['field']}>
                                <label>Last Name *</label>
                                <input
                                    type="text"
                                    value={lastName}
                                    onChange={(e) => setLastName(e.target.value)}
                                    placeholder="Last Name"
                                />
                            </div>
                        </div>

                        <div className={styles['row-2']}>
                            <div className={styles['field']}>
                                <label>Email Address *</label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="you@example.com"
                                />
                            </div>
                            <div className={styles['field']}>
                                <label>Phone Number *</label>
                                <input
                                    type="tel"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    placeholder="0712 345 678"
                                />
                            </div>
                        </div>
                    </section>

                    {/* Step 2: Delivery Method & Location (GPS / Google Map / Coordinates / Pickup Stations) */}
                    <section className={styles['card']}>
                        <div className={styles['card-head']}>
                            <span className={styles['step-num']}>2</span>
                            <div>
                                <h2>Delivery Location or Pickup Station</h2>
                                <p>
                                    Use automatic GPS, search on Google Maps, enter coordinates, or choose an admin-configured Pickup Station.
                                </p>
                            </div>
                        </div>

                        {/* Delivery Mode Switcher Tabs */}
                        <div className={styles['mode-tabs']}>
                            <button
                                type="button"
                                onClick={() => setDeliveryMethod("DOORSTEP")}
                                className={`${styles['mode-tab']} ${
                                    deliveryMethod === "DOORSTEP" ? styles['mode-tab-active'] : ''
                                }`}
                            >
                                <span className="material-symbols-outlined">delivery_dining</span>
                                <div>
                                    <strong>Doorstep Delivery</strong>
                                    <small>GPS, Google Map, or Coordinates</small>
                                </div>
                            </button>

                            <button
                                type="button"
                                onClick={() => setDeliveryMethod("PICKUP_STATION")}
                                className={`${styles['mode-tab']} ${
                                    deliveryMethod === "PICKUP_STATION" ? styles['mode-tab-active'] : ''
                                }`}
                            >
                                <span className="material-symbols-outlined">storefront</span>
                                <div>
                                    <strong>Pickup Station ({pickupStations.length})</strong>
                                    <small>Collect from a FreshMart Hub</small>
                                </div>
                            </button>
                        </div>

                        {locationNotice && (
                            <div className={styles['location-banner']}>{locationNotice}</div>
                        )}

                        {deliveryMethod === "DOORSTEP" ? (
                            <div className={styles['doorstep-pane']}>
                                {/* Location Picker Tools: GPS + Google Map Search + Coordinates */}
                                <div className={styles['locator-box']}>
                                    <div className={styles['locator-top']}>
                                        <button
                                            type="button"
                                            onClick={handleDetectGps}
                                            disabled={detectingGps}
                                            className={styles['gps-btn']}
                                        >
                                            <span className="material-symbols-outlined">my_location</span>
                                            <span>
                                                {detectingGps
                                                    ? "Getting GPS Location..."
                                                    : "Auto-Get My GPS Location"}
                                            </span>
                                        </button>

                                        <div className={styles['map-search-box']}>
                                            <span className="material-symbols-outlined">travel_explore</span>
                                            <input
                                                type="text"
                                                value={mapSearchQuery}
                                                onChange={(e) => setMapSearchQuery(e.target.value)}
                                                onKeyDown={(e) =>
                                                    e.key === 'Enter' &&
                                                    (e.preventDefault(), handleSearchPlaceOnMap())
                                                }
                                                placeholder="Search area or landmark on Google Map (e.g. Kilimani, Nairobi)"
                                            />
                                            <button
                                                type="button"
                                                onClick={handleSearchPlaceOnMap}
                                                disabled={searchingPlace}
                                            >
                                                {searchingPlace ? "Finding..." : "Pin on Map"}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Direct Coordinates Row */}
                                    <div className={styles['coords-bar']}>
                                        <div className={styles['coord-input']}>
                                            <label>Latitude</label>
                                            <input
                                                type="text"
                                                value={lat}
                                                onChange={(e) => setLat(e.target.value)}
                                                placeholder="-1.286389"
                                            />
                                        </div>
                                        <div className={styles['coord-input']}>
                                            <label>Longitude</label>
                                            <input
                                                type="text"
                                                value={lng}
                                                onChange={(e) => setLng(e.target.value)}
                                                placeholder="36.817223"
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleApplyCoordinates}
                                            className={styles['apply-coords-btn']}
                                        >
                                            Apply Coordinates
                                        </button>
                                    </div>
                                </div>

                                {/* Live Embedded Google Map */}
                                <div className={styles['map-frame-wrap']}>
                                    <div className={styles['map-frame-head']}>
                                        <span>
                                            📍 Pinned Coordinates: <strong>{lat}, {lng}</strong>
                                        </span>
                                        <a
                                            href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`}
                                            target="_blank"
                                            rel="noreferrer"
                                        >
                                            Open in Google Maps ↗
                                        </a>
                                    </div>
                                    <iframe
                                        title="Delivery Location Google Map"
                                        src={googleMapEmbedUrl}
                                        width="100%"
                                        height="230"
                                        style={{border: 0}}
                                        loading="lazy"
                                    />
                                </div>

                                {/* Street & Building Address Fields */}
                                <div className={styles['row-2']}>
                                    <div className={styles['field']}>
                                        <label>City / Town *</label>
                                        <input
                                            type="text"
                                            value={city}
                                            onChange={(e) => setCity(e.target.value)}
                                            placeholder="Nairobi"
                                        />
                                    </div>
                                    <div className={styles['field']}>
                                        <label>Area / Estate / Neighborhood *</label>
                                        <input
                                            type="text"
                                            value={area}
                                            onChange={(e) => setArea(e.target.value)}
                                            placeholder="e.g. Westlands, Kilimani"
                                        />
                                    </div>
                                </div>

                                <div className={styles['field']}>
                                    <label>Street / Road / Landmark *</label>
                                    <input
                                        type="text"
                                        value={street}
                                        onChange={(e) => setStreet(e.target.value)}
                                        placeholder="e.g. Waiyaki Way, Near Sarit Centre"
                                    />
                                </div>

                                <div className={styles['row-3']}>
                                    <div className={styles['field']}>
                                        <label>Building / Court (Optional)</label>
                                        <input
                                            type="text"
                                            value={buildingNumber}
                                            onChange={(e) => setBuildingNumber(e.target.value)}
                                            placeholder="Building No. / Name"
                                        />
                                    </div>
                                    <div className={styles['field']}>
                                        <label>Floor (Optional)</label>
                                        <input
                                            type="text"
                                            value={floor}
                                            onChange={(e) => setFloor(e.target.value)}
                                            placeholder="e.g. 2nd Floor"
                                        />
                                    </div>
                                    <div className={styles['field']}>
                                        <label>House / Apt No. (Optional)</label>
                                        <input
                                            type="text"
                                            value={apartmentNumber}
                                            onChange={(e) => setApartmentNumber(e.target.value)}
                                            placeholder="e.g. Apt B4"
                                        />
                                    </div>
                                </div>
                            </div>
                        ) : (
                            /* Pickup Station Selector Pane */
                            <div className={styles['pickup-pane']}>
                                <div className={styles['city-filters']}>
                                    {availableCities.map((c) => (
                                        <button
                                            key={c}
                                            type="button"
                                            onClick={() => setSelectedCityFilter(c)}
                                            className={`${styles['city-chip']} ${
                                                selectedCityFilter === c ? styles['city-chip-active'] : ''
                                            }`}
                                        >
                                            {c === "All" ? "All Cities" : c}
                                        </button>
                                    ))}
                                </div>

                                <div className={styles['stations-grid']}>
                                    {filteredStations.map((station) => {
                                        const isSelected =
                                            (selectedStation?.station_id || selectedStation?._id) ===
                                            (station.station_id || station._id);
                                        return (
                                            <div
                                                key={station.station_id || station._id}
                                                onClick={() => setSelectedStation(station)}
                                                className={`${styles['station-option']} ${
                                                    isSelected ? styles['station-selected'] : ''
                                                }`}
                                            >
                                                <div className={styles['station-opt-head']}>
                                                    <span className={styles['station-city-tag']}>
                                                        {station.city} • {station.area}
                                                    </span>
                                                    <span className={styles['free-tag']}>FREE PICKUP</span>
                                                </div>
                                                <h3>{station.name}</h3>
                                                <p className={styles['station-street']}>
                                                    {station.street}
                                                    {station.landmark ? ` (${station.landmark})` : ""}
                                                </p>
                                                <div className={styles['station-hours']}>
                                                    <span>🕒 {station.opening_hours}</span>
                                                    <span>📞 {station.phone}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {selectedStation && (
                                    <div className={styles['map-frame-wrap']}>
                                        <div className={styles['map-frame-head']}>
                                            <span>
                                                🏪 Selected Hub: <strong>{selectedStation.name}</strong>
                                            </span>
                                            <a
                                                href={`https://www.google.com/maps/search/?api=1&query=${activeLat},${activeLng}`}
                                                target="_blank"
                                                rel="noreferrer"
                                            >
                                                Directions in Google Maps ↗
                                            </a>
                                        </div>
                                        <iframe
                                            title="Selected Pickup Station Map"
                                            src={googleMapEmbedUrl}
                                            width="100%"
                                            height="220"
                                            style={{border: 0}}
                                            loading="lazy"
                                        />
                                    </div>
                                )}
                            </div>
                        )}
                    </section>
                </div>

                {/* Right Column: Sticky Order Summary & Payment CTA */}
                <aside className={styles['summary-card']}>
                    <h2>Order Summary</h2>

                    {cartItems.length > 0 && (
                        <div className={styles['mini-items']}>
                            {cartItems.map((item, idx) => (
                                <div key={item.product_id || idx} className={styles['mini-item']}>
                                    <div className={styles['mini-left']}>
                                        <strong>{item.quantity}×</strong>
                                        <span>{item.name}</span>
                                    </div>
                                    <span className={styles['mini-price']}>
                                        {formatKES(getEffectivePrice(item) * Number(item.quantity || 1))} KES
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className={styles['summary-breakdown']}>
                        {cart.original_total && Number(cart.savings) > 0 && (
                            <>
                                <div className={styles['sum-row']}>
                                    <span>Original Subtotal</span>
                                    <span>{formatKES(cart.original_total)} KES</span>
                                </div>
                                <div className={styles['sum-row']} style={{color: '#059669'}}>
                                    <span>Discount Savings</span>
                                    <strong>− {formatKES(cart.savings)} KES</strong>
                                </div>
                            </>
                        )}
                        <div className={styles['sum-row']}>
                            <span>Delivery Mode</span>
                            <strong>
                                {deliveryMethod === "PICKUP_STATION"
                                    ? "Pickup Station"
                                    : "20-Min Doorstep"}
                            </strong>
                        </div>
                        <div className={styles['sum-row']}>
                            <span>Delivery Fee</span>
                            <span className={styles['free-pill']}>FREE</span>
                        </div>
                    </div>

                    <div className={styles['destination-preview']}>
                        <small>Delivering To:</small>
                        {deliveryMethod === "PICKUP_STATION" && selectedStation ? (
                            <strong>
                                🏪 {selectedStation.name} ({selectedStation.area}, {selectedStation.city})
                            </strong>
                        ) : (
                            <strong>
                                📍 {[street, area, city].filter(Boolean).join(", ") || "Pinned GPS Location"}
                            </strong>
                        )}
                    </div>

                    <div className={styles['total-row']}>
                        <span>Total Payable</span>
                        <strong>{formatKES(cart.total)} KES</strong>
                    </div>

                    {hasCheckoutStockBlock && (
                        <div className={styles['stock-conflict-box']}>
                            <strong>🚨 Item Availability Changed</strong>
                            <ul>
                                {checkoutStockIssues.map((issue) => (
                                    <li key={issue.product_id}>{issue.message}</li>
                                ))}
                            </ul>
                            <Link to="/cart" className={styles['return-cart-btn']}>
                                ← Return to Cart to Update Basket
                            </Link>
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={handleCheckout}
                        disabled={submitting || hasCheckoutStockBlock}
                        className={`btn1 ${styles['pay-btn']}`}
                    >
                        <span>
                            {submitting
                                ? "Checking Stock & Redirecting..."
                                : hasCheckoutStockBlock
                                ? "Item Unavailable — Update Cart"
                                : `Pay ${formatKES(cart.total)} KES with Stripe`}
                        </span>
                        <span className="material-symbols-outlined">lock</span>
                    </button>

                    <div className={styles['security-note']}>
                        <span className="material-symbols-outlined">verified_user</span>
                        <span>256-Bit SSL Encrypted • Instant Order Confirmation</span>
                    </div>
                </aside>
            </div>
        </div>
    );
};

export default Checkout;
