import * as api from "../api";
import {SHIPPING_FETCH, SHIPPING_FETCH_ALL} from "../constants/actions/shipping";
import {queryClient} from "../index";

export const fetchShipments = (page, onSuccess) => async (dispatch) => {
    try {
        const shippingData = await api.fetchShipments(page).then(res => res.data);
        dispatch({type: SHIPPING_FETCH_ALL, data: shippingData});
        onSuccess();
    } catch (e) {
        console.log(e);
    }
}

export const fetchShipment = (id, onSuccess, onError) => async (dispatch) => {
    try {
        const shipmentData = await api.fetchShipment(id).then(res => res.data);
        dispatch({type: SHIPPING_FETCH, data: shipmentData})
        onSuccess(shipmentData);
    } catch (e) {
        onError(e.response?.data || {message: e.message});
    }
}

export const updateShipment = (id, status, onSuccess, onError) => async () => {
    try {
        const res = await api.updateShipment(id, status);
        queryClient.invalidateQueries({queryKey: ['shipment']});
        queryClient.invalidateQueries({queryKey: ['order']});
        queryClient.invalidateQueries({queryKey: ['myShipments']});
        queryClient.invalidateQueries({queryKey: ['adminShipments']});
        queryClient.invalidateQueries({queryKey: ['adminShipmentsQuickList']});
        queryClient.invalidateQueries({queryKey: ['adminOrders']});
        queryClient.invalidateQueries({queryKey: ['adminOrdersQuickList']});
        queryClient.invalidateQueries({queryKey: ['adminOverview']});
        onSuccess(res.data);
    } catch (e) {
        onError(e.response?.data || {message: e.message});
    }
}