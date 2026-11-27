import Shipments from "../../model/Shipments.js";
import Order, { ORDER_STATUS_ENUM } from "../../model/Orders.js";
import Products from "../../model/Products.js";
import PickupStations from "../../model/PickupStations.js";
import Users from "../../model/Users.js";
import Pagination from "../../utils/pagination.js";
import {
    reconcileOrderAndShipment,
    transitionOrderAndShipmentStatus,
} from "../../utils/orderStatusSync.js";

const defaultPickupStations = [
    {
        name: "KijaniMart Westlands Hub (Sarit Centre)",
        city: "Nairobi",
        area: "Westlands",
        street: "Karuna Road, Ground Floor Locker Bay",
        landmark: "Opposite Sarit Centre Main Gate",
        phone: "0711 234 501",
        opening_hours: "Mon–Sun: 7:00 AM – 9:30 PM",
        delivery_fee: 0,
        coordinates: { lat: -1.2615, lng: 36.8021 },
        active: true,
    },
    {
        name: "KijaniMart CBD Express Pickup (Kenyatta Ave)",
        city: "Nairobi",
        area: "CBD",
        street: "Kenyatta Avenue, I&M Tower Arcade",
        landmark: "Next to GPO Huduma Centre",
        phone: "0711 234 502",
        opening_hours: "Mon–Sat: 7:00 AM – 8:30 PM",
        delivery_fee: 0,
        coordinates: { lat: -1.2841, lng: 36.8219 },
        active: true,
    },
    {
        name: "KijaniMart Kilimani & Yaya Station",
        city: "Nairobi",
        area: "Kilimani",
        street: "Argwings Kodhek Road",
        landmark: "Beside Yaya Centre Parking Entrance",
        phone: "0711 234 503",
        opening_hours: "Mon–Sun: 7:30 AM – 9:00 PM",
        delivery_fee: 0,
        coordinates: { lat: -1.2928, lng: 36.7878 },
        active: true,
    },
    {
        name: "KijaniMart Thika Road Mall (TRM) Hub",
        city: "Nairobi",
        area: "Roysambu",
        street: "Thika Superhighway, Exit 8",
        landmark: "TRM Ground Level Service Desk",
        phone: "0711 234 504",
        opening_hours: "Mon–Sun: 8:00 AM – 9:00 PM",
        delivery_fee: 0,
        coordinates: { lat: -1.2195, lng: 36.8883 },
        active: true,
    },
    {
        name: "KijaniMart Karen Hub (Waterfront Mall)",
        city: "Nairobi",
        area: "Karen",
        street: "Karen Road",
        landmark: "The Waterfront Karen, South Entrance",
        phone: "0711 234 505",
        opening_hours: "Mon–Sun: 8:00 AM – 8:30 PM",
        delivery_fee: 0,
        coordinates: { lat: -1.3268, lng: 36.7115 },
        active: true,
    },
    {
        name: "KijaniMart Mombasa Nyali City Mall Station",
        city: "Mombasa",
        area: "Nyali",
        street: "Links Road, Nyali",
        landmark: "Nyali Centre Ground Floor",
        phone: "0711 234 506",
        opening_hours: "Mon–Sun: 8:00 AM – 9:00 PM",
        delivery_fee: 0,
        coordinates: { lat: -4.0352, lng: 39.7138 },
        active: true,
    },
];

export const getPickupStations = async (req, res) => {
    try {
        let stations = await PickupStations.find().sort({ created_at: 1 });
        if (stations.length === 0) {
            await PickupStations.insertMany(defaultPickupStations);
            stations = await PickupStations.find().sort({ created_at: 1 });
        }
        return res.status(200).json(stations);
    } catch (e) {
        return res.status(500).json({ message: e.message });
    }
};

export const createPickupStation = async (req, res) => {
    try {
        const userId = req.body.id;
        const user = await Users.findById(userId, { password: 0 });
        if (!user || user.role !== "ADMIN") {
            return res.status(401).json({ message: "Unauthorized user" });
        }

        const {
            name,
            city = "Nairobi",
            area,
            street,
            landmark = "",
            phone = "0711 234 500",
            opening_hours = "Mon–Sun: 7:00 AM – 9:00 PM",
            delivery_fee = 0,
            coordinates,
            lat,
            lng,
            active = true,
        } = req.body;

        if (!name || !area || !street) {
            return res.status(400).json({
                message: "Station name, area, and street are required.",
            });
        }

        const station = await PickupStations.create({
            name,
            city,
            area,
            street,
            landmark,
            phone,
            opening_hours,
            delivery_fee: Number(delivery_fee || 0),
            coordinates: {
                lat: Number(coordinates?.lat ?? lat ?? -1.286389),
                lng: Number(coordinates?.lng ?? lng ?? 36.817223),
            },
            active: Boolean(active),
        });

        return res.status(201).json(station);
    } catch (e) {
        return res.status(400).json({ message: e.message });
    }
};

export const updatePickupStation = async (req, res) => {
    try {
        const userId = req.body.id;
        const user = await Users.findById(userId, { password: 0 });
        if (!user || user.role !== "ADMIN") {
            return res.status(401).json({ message: "Unauthorized user" });
        }

        const { stationId } = req.params;
        const updateData = { ...req.body };
        delete updateData.id;

        if (updateData.lat !== undefined || updateData.lng !== undefined) {
            updateData.coordinates = {
                lat: Number(updateData.lat ?? -1.286389),
                lng: Number(updateData.lng ?? 36.817223),
            };
        }

        const updated = await PickupStations.findOneAndUpdate(
            { $or: [{ station_id: stationId }, { _id: stationId }] },
            updateData,
            { new: true }
        );

        if (!updated) {
            return res.status(404).json({ message: "Pickup station not found" });
        }

        return res.status(200).json(updated);
    } catch (e) {
        return res.status(400).json({ message: e.message });
    }
};

export const deletePickupStation = async (req, res) => {
    try {
        const userId = req.body.id;
        const user = await Users.findById(userId, { password: 0 });
        if (!user || user.role !== "ADMIN") {
            return res.status(401).json({ message: "Unauthorized user" });
        }

        const { stationId } = req.params;
        await PickupStations.findOneAndDelete({
            $or: [{ station_id: stationId }, { _id: stationId }],
        });

        return res.status(200).json({ message: "Pickup station deleted" });
    } catch (e) {
        return res.status(400).json({ message: e.message });
    }
};

export const getShipmentId = async (req, res) => {
    const { id } = req.params;
    try {
        const your_shipment = await Shipments.findOne({ order_id: id });
        const order = await Order.findOne({ order_id: id });

        if (!your_shipment && !order)
            return res.status(400).json({ message: "Invalid order id" });

        const synced = await reconcileOrderAndShipment(order, your_shipment);

        const rawProducts = order?.products || [];
        const productIds = rawProducts.map((p) => p.product_id).filter(Boolean);
        const dbProducts =
            productIds.length > 0
                ? await Products.find({ product_id: { $in: productIds } })
                : [];
        const productMap = new Map(dbProducts.map((p) => [p.product_id, p._doc || p]));

        const enrichedProducts = rawProducts.map((item) => {
            const dbProd = productMap.get(item.product_id) || {};
            return {
                ...dbProd,
                product_id: item.product_id,
                name: dbProd.name || item.name || "Grocery Item",
                image: dbProd.image || "",
                quantity: Number(item.quantity) || 1,
            };
        });

        return res.status(200).json({
            order_id: your_shipment?.order_id || order?.order_id,
            total: your_shipment?.total ?? order?.total ?? 0,
            address: your_shipment?.address || order?.address || {},
            status: synced.status,
            order_status: synced.status,
            status_history: synced.status_history,
            seller_updates: order?.seller_updates || [],
            ordered_at: your_shipment?.ordered_at || order?.ordered_at,
            name: order?.name || {},
            email: order?.email || "",
            phone_number: order?.phone_number || "",
            products: enrichedProducts,
        });
    } catch (e) {
        return res.status(400).json({ message: e.message });
    }
};

export const getUserShipments = async (req, res) => {
    try {
        const userId = req.body.id;
        const user = await Users.findById(userId, { password: 0 });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const orders = await Order.find({
            email: { $regex: `^${user.email}$`, $options: "i" },
        }).sort({ ordered_at: -1 });

        const orderIds = orders.map((o) => o.order_id);
        const shipments = await Shipments.find({ order_id: { $in: orderIds } });
        const shipmentMap = new Map(shipments.map((s) => [s.order_id, s]));

        const allProductIds = Array.from(
            new Set(
                orders.flatMap((o) => (o.products || []).map((p) => p.product_id).filter(Boolean))
            )
        );
        const dbProducts = await Products.find({ product_id: { $in: allProductIds } });
        const productMap = new Map(dbProducts.map((p) => [p.product_id, p._doc || p]));

        const items = await Promise.all(
            orders.map(async (ord) => {
                const shipment = shipmentMap.get(ord.order_id);
                const synced = await reconcileOrderAndShipment(ord, shipment);
                const enrichedProducts = (ord.products || []).map((item) => {
                    const dbProd = productMap.get(item.product_id) || {};
                    return {
                        product_id: item.product_id,
                        name: dbProd.name || item.name || "Grocery Item",
                        image: dbProd.image || "",
                        category: dbProd.category || "",
                        price: dbProd.price || 0,
                        discount: dbProd.discount || 0,
                        weight: dbProd.weight || "",
                        measurement: dbProd.measurement || "",
                        seller: dbProd.seller || null,
                        quantity: Number(item.quantity) || 1,
                    };
                });

                return {
                    order_id: ord.order_id,
                    ordered_at: ord.ordered_at || shipment?.ordered_at,
                    total: ord.total ?? shipment?.total ?? 0,
                    address: ord.address || shipment?.address || {},
                    name: ord.name || {},
                    email: ord.email || "",
                    phone_number: ord.phone_number || "",
                    order_status: synced.status,
                    status: synced.status,
                    shipment_status: synced.status,
                    status_history: synced.status_history,
                    products: enrichedProducts,
                };
            })
        );

        return res.status(200).json(items);
    } catch (e) {
        return res.status(500).json({ message: e.message });
    }
};

export const updateShipments = async (req, res) => {
    try {
        const { status, id } = req.body;

        const user = await Users.findById(id, { password: 0 });
        if (!user)
            return res.status(404).json({ message: `User ${id} was not found` });
        if (user.role !== "ADMIN")
            return res.status(401).json({ message: "Unauthorized user" });

        if (!status)
            return res.status(400).json({ message: "Please provide the new status" });

        if (!ORDER_STATUS_ENUM.includes(status))
            return res.status(400).json({ message: "Please select a valid shipment status" });

        const result = await transitionOrderAndShipmentStatus({
            order_id: req.params.id,
            nextStatus: status,
            actorUser: user,
            source: "SHIPPING",
            origin: req.headers.origin,
        });

        if (result.notFound) {
            return res.status(404).json({ message: "Shipment / order not found" });
        }

        return res.status(200).json({
            ...(result.shipment?._doc || result.order?._doc || {}),
            status: result.status,
            order_status: result.status,
        });
    } catch (e) {
        return res.status(e.statusCode || 400).json({ message: e.message });
    }
};

export const postShipments = async (req, res) => {
    const { ordered_at, order_id, address, total } = req.body;

    const newShippment = new Shipments({
        total: total,
        ordered_at: ordered_at,
        address: address,
        order_id: order_id,
    });

    try {
        await newShippment.save();
        res.status(200).json(newShippment);
    } catch (e) {
        res.status(409).json({ message: e.message });
    }
};

export const getShipments = async (req, res) => {
    try {
        const id = req.body.id;

        const user = await Users.findById(id, { password: 0 });
        if (!user)
            return res.status(404).json({ message: `User ${id} was not found` });
        if (user.role !== "ADMIN")
            return res.status(401).json({ message: "Unauthorized user" });

        const { page } = req.query;

        const shipments = await Shipments.find().sort({ ordered_at: -1 });
        const orderIds = shipments.map((s) => s.order_id);
        const pairedOrders = await Order.find({ order_id: { $in: orderIds } });
        const orderMap = new Map(pairedOrders.map((o) => [o.order_id, o]));

        await Promise.all(
            shipments.map((sh) => reconcileOrderAndShipment(orderMap.get(sh.order_id), sh))
        );

        const enrichedShipments = shipments.map((sh) => {
            const paired = orderMap.get(sh.order_id);
            return {
                ...(sh._doc || sh),
                seller_updates: paired?.seller_updates || [],
            };
        });

        const total_pages = Math.ceil(enrichedShipments.length / 20);

        const pagedShipments = Pagination(page, enrichedShipments, 20);

        res.status(200).json({ total_pages, shipments: pagedShipments });
    } catch (e) {
        res.status(400).json({ message: e.message });
    }
};
