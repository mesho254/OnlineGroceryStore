import * as api from "../api";
import {
    LOGIN,
    LOGOUT,
    SIGNUP,
    UPDATE_WISHLIST,
} from "../constants/actions/authentication";
import {queryClient} from "../index";
import {readStoredProfile} from "../utils/authSession";

export const authLogin = (email, password, onSuccess, onError) => async (dispatch) => {
    try {
        const loginData = await api.authLogin(email, password).then((res) => res.data);
        dispatch({type: LOGIN, data: loginData});
        onSuccess();
    } catch (e) {
        onError(e.response ? e.response.data : {message: "Server Error"});
    }
};

export const authSignup =
    (first_name, last_name, email, password, onSuccess, onError) => async (dispatch) => {
        try {
            const signupData = await api
                .authSignup(first_name, last_name, email, password)
                .then((res) => res.data);
            dispatch({type: SIGNUP, data: signupData});
            onSuccess();
        } catch (e) {
            onError(e.response ? e.response.data : {message: "Server Error"});
        }
    };

export const logout = async (dispatch) => {
    const current = readStoredProfile();
    const refreshToken = current?.refreshToken || null;
    dispatch({type: LOGOUT});
    if (refreshToken) {
        api.authLogout(refreshToken).catch(() => {});
    }
};

export const verifyUser = (onSuccess, onError) => async () => {
    try {
        const verificationData = await api.verify().then((res) => res.data);
        onSuccess(verificationData);
    } catch (e) {
        onError(e);
    }
};

export const updateWishlist = (product_id, onError) => async (dispatch) => {
    try {
        const wishlistData = await api.userUpdateWishlist(product_id).then((res) => res.data);
        dispatch({type: UPDATE_WISHLIST, data: wishlistData.wishlist});
        queryClient.invalidateQueries({queryKey: ['wishlist']});
    } catch (e) {
        onError(e);
    }
};

export const getWishlist = (onSuccess, onError) => async () => {
    try {
        const wishlist = await api.getWishlist().then((res) => res.data);
        onSuccess(wishlist);
    } catch (e) {
        onError(e);
    }
};
