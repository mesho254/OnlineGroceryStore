export const ORDER_STATUS_CONFIG = {
    ORDER_PLACED: {
        id: 'ORDER_PLACED',
        label: 'ORDER PLACED',
        shortLabel: 'Order Placed',
        icon: 'receipt_long',
        tone: 'blue',
        progress: 12,
        stageIndex: 0,
        desc: 'Order received and recorded in the system.',
        detailMessage:
            'Your order has been placed successfully and is being verified for fulfillment.',
    },
    PENDING_CONFIRMATION: {
        id: 'PENDING_CONFIRMATION',
        label: 'PENDING CONFIRMATION',
        shortLabel: 'Pending Confirmation',
        icon: 'fact_check',
        tone: 'blue',
        progress: 26,
        stageIndex: 0,
        desc: 'Order payment and stock reservation confirmed.',
        detailMessage:
            'Your order is confirmed and queued for our freshness quality check and packing team.',
    },
    WAITING_TO_BE_SHIPPED: {
        id: 'WAITING_TO_BE_SHIPPED',
        label: 'WAITING TO BE SHIPPED',
        shortLabel: 'Waiting to be Shipped',
        icon: 'inventory_2',
        tone: 'amber',
        progress: 45,
        stageIndex: 1,
        desc: 'Items handpicked, packed, and waiting for dispatch rider.',
        detailMessage:
            'Your groceries have been packed and are waiting to be handed over to our express dispatch rider.',
    },
    SHIPPED: {
        id: 'SHIPPED',
        label: 'SHIPPED',
        shortLabel: 'Shipped',
        icon: 'local_shipping',
        tone: 'amber',
        progress: 68,
        stageIndex: 2,
        desc: 'Package is in transit with our express rider.',
        detailMessage:
            'Your order has been shipped and is currently in transit to your delivery destination or pickup station.',
    },
    AVAILABLE_FOR_PICKUP: {
        id: 'AVAILABLE_FOR_PICKUP',
        label: 'AVAILABLE FOR PICKUP',
        shortLabel: 'Available for Pickup',
        icon: 'storefront',
        tone: 'blue',
        progress: 86,
        stageIndex: 2,
        desc: 'Arrived at Pickup Station / Ready for customer handover.',
        detailMessage:
            'Your package has arrived and is available for pickup at your selected FreshMart Pickup Station.',
    },
    DELIVERED: {
        id: 'DELIVERED',
        label: 'DELIVERED',
        shortLabel: 'Delivered',
        icon: 'check_circle',
        tone: 'green',
        progress: 100,
        stageIndex: 3,
        desc: 'Order delivered to customer (triggers product & seller review).',
        detailMessage: 'Your item/order has been delivered.',
    },
    RETURN_IN_PROGRESS: {
        id: 'RETURN_IN_PROGRESS',
        label: 'RETURN IN PROGRESS',
        shortLabel: 'Return in Progress',
        icon: 'assignment_return',
        tone: 'amber',
        progress: 100,
        stageIndex: 3,
        desc: 'Customer return initiated and in transit back to hub.',
        detailMessage:
            'A return for your item(s) is currently in progress and being processed by our quality team.',
    },
    RETURNED: {
        id: 'RETURNED',
        label: 'RETURNED',
        shortLabel: 'Returned',
        icon: 'keyboard_return',
        tone: 'grey',
        progress: 100,
        stageIndex: 3,
        desc: 'Item returned to warehouse and stock restored.',
        detailMessage:
            'Your item/order has been returned to our facility. If eligible for a refund, it will be processed shortly.',
    },
    REFUNDED: {
        id: 'REFUNDED',
        label: 'REFUNDED',
        shortLabel: 'Refunded',
        icon: 'currency_exchange',
        tone: 'grey',
        progress: 100,
        stageIndex: 3,
        desc: 'Payment refund processed back to customer.',
        detailMessage:
            'Refund for your Item(s) has been processed. Depending on your initial payment method, Mobile Money may take up to 24 working hours and 3-9 business days for Card Payments. Please check your email for more details.',
    },
    FAILED_DELIVERY: {
        id: 'FAILED_DELIVERY',
        label: 'FAILED DELIVERY',
        shortLabel: 'Failed Delivery',
        icon: 'error_outline',
        tone: 'grey',
        progress: 100,
        stageIndex: 3,
        desc: 'Delivery or pickup attempt failed after reminders.',
        detailMessage:
            "Despite our repeated reminders, you haven't picked up the package from our Pickup Station. We are now cancelling this package and will return the item back to the Seller.",
    },
    CANCELLED: {
        id: 'CANCELLED',
        label: 'CANCELLED',
        shortLabel: 'Cancelled',
        icon: 'cancel',
        tone: 'grey',
        progress: 100,
        stageIndex: 3,
        desc: 'Order cancelled and reserved stock restored.',
        detailMessage:
            'Unfortunately, this item has been cancelled. - If your order was prepaid, we will proceed with the refund immediately and keep you updated by email once processed from our side.',
    },
    CANCELLED_PAYMENT_UNSUCCESSFUL: {
        id: 'CANCELLED_PAYMENT_UNSUCCESSFUL',
        label: 'CANCELLED - PAYMENT UNSUCCESSFUL',
        shortLabel: 'Cancelled (Payment Unsuccessful)',
        icon: 'credit_card_off',
        tone: 'grey',
        progress: 100,
        stageIndex: 3,
        desc: 'Cancelled because payment could not be completed.',
        detailMessage:
            'Unfortunately, this item/order has been cancelled because your payment could not be completed. - If you consider this to be an error and you have been charged, kindly reach out to our customer service in order to receive the appropriate assistance.',
    },
    // Legacy aliases mapped seamlessly
    CREATED: {
        id: 'CREATED',
        label: 'ORDER PLACED',
        shortLabel: 'Order Placed',
        icon: 'receipt_long',
        tone: 'blue',
        progress: 15,
        stageIndex: 0,
        desc: 'Order received and confirmed.',
        detailMessage: 'Your order has been placed and confirmed.',
    },
    PROCESSING: {
        id: 'PROCESSING',
        label: 'WAITING TO BE SHIPPED',
        shortLabel: 'Waiting to be Shipped',
        icon: 'inventory_2',
        tone: 'amber',
        progress: 45,
        stageIndex: 1,
        desc: 'Items are being packed for shipment.',
        detailMessage: 'Your order is being packed and prepared for shipment.',
    },
    FULFILLED: {
        id: 'FULFILLED',
        label: 'DELIVERED',
        shortLabel: 'Delivered',
        icon: 'check_circle',
        tone: 'green',
        progress: 100,
        stageIndex: 3,
        desc: 'Order fulfilled and delivered.',
        detailMessage: 'Your item/order has been delivered.',
    },
};

export const ADMIN_SELECTABLE_STATUSES = [
    'ORDER_PLACED',
    'PENDING_CONFIRMATION',
    'WAITING_TO_BE_SHIPPED',
    'SHIPPED',
    'AVAILABLE_FOR_PICKUP',
    'DELIVERED',
    'RETURN_IN_PROGRESS',
    'RETURNED',
    'REFUNDED',
    'FAILED_DELIVERY',
    'CANCELLED',
    'CANCELLED_PAYMENT_UNSUCCESSFUL',
];

export const normalizeStatusKey = (st) => {
    if (!st) return 'ORDER_PLACED';
    if (st === 'CREATED') return 'ORDER_PLACED';
    if (st === 'PROCESSING') return 'WAITING_TO_BE_SHIPPED';
    if (st === 'FULFILLED') return 'DELIVERED';
    return st;
};

export const getStatusMeta = (statusKey) => {
    const norm = normalizeStatusKey(statusKey);
    return (
        ORDER_STATUS_CONFIG[norm] ||
        ORDER_STATUS_CONFIG[statusKey] || {
            id: statusKey || 'ORDER_PLACED',
            label: String(statusKey || 'ORDER PLACED').replace(/_/g, ' '),
            shortLabel: String(statusKey || 'Order Placed').replace(/_/g, ' '),
            icon: 'schedule',
            tone: 'blue',
            progress: 15,
            stageIndex: 0,
            desc: 'Order status update.',
            detailMessage: `Your order status is ${String(statusKey || '').replace(/_/g, ' ')}.`,
        }
    );
};

export const isDeliveredStatus = (st) => {
    const norm = normalizeStatusKey(st);
    return norm === 'DELIVERED';
};

export const isTerminalGreyStatus = (st) => {
    const norm = normalizeStatusKey(st);
    return [
        'CANCELLED',
        'CANCELLED_PAYMENT_UNSUCCESSFUL',
        'FAILED_DELIVERY',
        'RETURNED',
        'REFUNDED',
    ].includes(norm);
};

const FORWARD_PIPELINE = [
    'ORDER_PLACED',
    'PENDING_CONFIRMATION',
    'WAITING_TO_BE_SHIPPED',
    'SHIPPED',
    'AVAILABLE_FOR_PICKUP',
    'DELIVERED',
];

const RETURN_PIPELINE = ['RETURN_IN_PROGRESS', 'RETURNED', 'REFUNDED'];

/**
 * Builds the chronological vertical timeline steps for an order/shipment,
 * combining stored status_history with any implied pipeline milestones.
 */
export const buildTimelineEntries = (orderOrShipment) => {
    const rawHistory = Array.isArray(orderOrShipment?.status_history)
        ? orderOrShipment.status_history
        : [];
    const currentStatus = normalizeStatusKey(
        orderOrShipment?.status || orderOrShipment?.shipment_status || orderOrShipment?.order_status
    );
    const baseDate = orderOrShipment?.ordered_at || new Date().toISOString();
    const nowIso = new Date().toISOString();

    const existingMap = new Map();
    for (const h of rawHistory) {
        if (!h?.status) continue;
        const norm = normalizeStatusKey(h.status);
        if (!existingMap.has(norm)) {
            existingMap.set(norm, {
                status: norm,
                timestamp: h.timestamp || baseDate,
                note: h.note || '',
            });
        }
    }

    const pickEntry = (stepKey, fallbackTime) =>
        existingMap.get(stepKey) || {status: stepKey, timestamp: fallbackTime, note: ''};

    const list = [];
    const fIdx = FORWARD_PIPELINE.indexOf(currentStatus);
    const rIdx = RETURN_PIPELINE.indexOf(currentStatus);

    if (fIdx >= 0) {
        for (let i = 0; i <= fIdx; i++) {
            const k = FORWARD_PIPELINE[i];
            list.push(pickEntry(k, i === fIdx ? nowIso : baseDate));
        }
    } else if (rIdx >= 0) {
        for (const k of FORWARD_PIPELINE) {
            list.push(pickEntry(k, baseDate));
        }
        for (let i = 0; i <= rIdx; i++) {
            list.push(pickEntry(RETURN_PIPELINE[i], nowIso));
        }
    } else if (currentStatus === 'FAILED_DELIVERY') {
        for (const k of FORWARD_PIPELINE.slice(0, 5)) {
            list.push(pickEntry(k, baseDate));
        }
        list.push(pickEntry('FAILED_DELIVERY', nowIso));
    } else if (currentStatus === 'CANCELLED_PAYMENT_UNSUCCESSFUL') {
        list.push(pickEntry('ORDER_PLACED', baseDate));
        list.push(pickEntry('PENDING_CONFIRMATION', baseDate));
        list.push(pickEntry('CANCELLED_PAYMENT_UNSUCCESSFUL', nowIso));
    } else if (currentStatus === 'CANCELLED') {
        list.push(pickEntry('ORDER_PLACED', baseDate));
        list.push(pickEntry('PENDING_CONFIRMATION', baseDate));
        for (const k of FORWARD_PIPELINE.slice(2)) {
            if (existingMap.has(k)) {
                list.push(existingMap.get(k));
            }
        }
        list.push(pickEntry('CANCELLED', nowIso));
    } else {
        list.push(pickEntry('ORDER_PLACED', baseDate));
        if (currentStatus !== 'ORDER_PLACED') {
            list.push(pickEntry(currentStatus, nowIso));
        }
    }

    return list.map((entry, idx) => {
        const isLast = idx === list.length - 1;
        const meta = getStatusMeta(entry.status);
        return {
            ...entry,
            label: meta.label,
            shortLabel: meta.shortLabel,
            tone: meta.tone,
            detailMessage: meta.detailMessage,
            isLast,
        };
    });
};

/**
 * Builds the horizontal milestone cards / stepper nodes for Shipment list cards
 * and the Live Shipment Tracker hero card, dynamically adapting to forward,
 * return/refund, failed-delivery, and cancellation paths across all 12 statuses.
 */
export const buildMilestoneCards = (orderOrShipment, isPickup = false) => {
    const currentStatus = normalizeStatusKey(
        orderOrShipment?.shipment_status ||
            orderOrShipment?.status ||
            orderOrShipment?.order_status
    );
    const rawHistory = Array.isArray(orderOrShipment?.status_history)
        ? orderOrShipment.status_history
        : [];
    const historySet = new Set(
        rawHistory.map((h) => normalizeStatusKey(h?.status)).filter(Boolean)
    );

    const makeCard = (key, state) => {
        const meta = getStatusMeta(key);
        let desc = meta.desc;
        if (key === 'AVAILABLE_FOR_PICKUP' && !isPickup) {
            desc = 'Arrived at local hub / ready for handover.';
        } else if (key === 'DELIVERED') {
            desc = isPickup ? 'Collected at Pickup Station.' : 'Delivered to recipient.';
        }
        return {
            id: key,
            label: meta.label,
            shortLabel: meta.shortLabel,
            desc,
            icon: meta.icon,
            tone: meta.tone,
            state, // 'completed' | 'active' | 'delivered' | 'terminal' | 'upcoming'
        };
    };

    const fIdx = FORWARD_PIPELINE.indexOf(currentStatus);
    if (fIdx >= 0) {
        return FORWARD_PIPELINE.map((key, idx) => {
            if (idx < fIdx) return makeCard(key, 'completed');
            if (idx === fIdx) {
                return makeCard(key, currentStatus === 'DELIVERED' ? 'delivered' : 'active');
            }
            return makeCard(key, 'upcoming');
        });
    }

    const rIdx = RETURN_PIPELINE.indexOf(currentStatus);
    if (rIdx >= 0) {
        const cards = FORWARD_PIPELINE.map((key) => makeCard(key, 'completed'));
        RETURN_PIPELINE.forEach((key, idx) => {
            if (idx < rIdx) cards.push(makeCard(key, 'completed'));
            else if (idx === rIdx) {
                cards.push(makeCard(key, isTerminalGreyStatus(currentStatus) ? 'terminal' : 'active'));
            } else {
                cards.push(makeCard(key, 'upcoming'));
            }
        });
        return cards;
    }

    if (currentStatus === 'FAILED_DELIVERY') {
        return [
            ...FORWARD_PIPELINE.slice(0, 5).map((key) => makeCard(key, 'completed')),
            makeCard('FAILED_DELIVERY', 'terminal'),
        ];
    }

    if (currentStatus === 'CANCELLED_PAYMENT_UNSUCCESSFUL') {
        return [
            makeCard('ORDER_PLACED', 'completed'),
            makeCard('PENDING_CONFIRMATION', 'completed'),
            makeCard('CANCELLED_PAYMENT_UNSUCCESSFUL', 'terminal'),
        ];
    }

    if (currentStatus === 'CANCELLED') {
        const reached = [
            makeCard('ORDER_PLACED', 'completed'),
            makeCard('PENDING_CONFIRMATION', 'completed'),
        ];
        for (const key of FORWARD_PIPELINE.slice(2)) {
            if (historySet.has(key)) {
                reached.push(makeCard(key, 'completed'));
            }
        }
        reached.push(makeCard('CANCELLED', 'terminal'));
        return reached;
    }

    return [makeCard('ORDER_PLACED', 'completed'), makeCard(currentStatus, 'active')];
};
