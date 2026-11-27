import * as api from '../api/index';
import {ORDERS_FETCH, ORDERS_FETCH_ALL} from "../constants/actions/orders";
import {queryClient} from "../index";

export const fetchOrder = (id, onSuccess, onError) => async (dispatch) => {
    try {
        const orderData = await api.fetchOrder(id).then(res => res.data);
        dispatch({type: ORDERS_FETCH, data: orderData})
        onSuccess(orderData);
    } catch (e) {
        onError(e.response?.data || {message: e.message});
    }
}

export const updateOrder = (id, status, onSuccess, onError) => async () => {
    try {
        const res = await api.updateOrder(id, status);
        queryClient.invalidateQueries({queryKey: ['order']});
        queryClient.invalidateQueries({queryKey: ['shipment']});
        queryClient.invalidateQueries({queryKey: ['myShipments']});
        queryClient.invalidateQueries({queryKey: ['adminOrders']});
        queryClient.invalidateQueries({queryKey: ['adminOrdersQuickList']});
        queryClient.invalidateQueries({queryKey: ['adminShipments']});
        queryClient.invalidateQueries({queryKey: ['adminShipmentsQuickList']});
        queryClient.invalidateQueries({queryKey: ['adminOverview']});
        onSuccess(res.data);
    } catch (e) {
        onError(e.response?.data || {message: e.message});
    }
}

export const fetchOrders = (page, onSuccess, onError) => async (dispatch) => {
    try {
        const ordersData = await api.fetchOrders(page).then(res => res.data);
        dispatch({type: ORDERS_FETCH_ALL, data: ordersData});
        onSuccess();
    } catch (e) {
        onError(e);
    }
}

export const postOrder = (token, data, onSuccess, onError) => async () => {
    try {
        // const [name, email, phone, country, city, area,
        //     street, building_number, floor, apartment_number] = data;
        const {url} = await api.processPayment(token, data).then(res => res.data);
        
        onSuccess(url);
    } catch (e) {
        onError(e);
    }
}