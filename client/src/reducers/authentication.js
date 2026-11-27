import {
    LOGIN,
    LOGOUT,
    REFRESH_TOKENS,
    SIGNUP,
    UPDATE_PROFILE,
    UPDATE_WISHLIST,
} from "../constants/actions/authentication";
import {
    clearStoredProfile,
    readStoredProfile,
    writeStoredProfile,
} from "../utils/authSession";

const profile = readStoredProfile();

const initialState = {
    user: profile?.user || null,
    token: profile?.token || null,
    accessToken: profile?.accessToken || profile?.token || null,
    refreshToken: profile?.refreshToken || null,
    accessTokenExpiresAt: profile?.accessTokenExpiresAt || null,
    refreshTokenExpiresAt: profile?.refreshTokenExpiresAt || null,
};

const toAuthState = (session) => ({
    user: session?.user || null,
    token: session?.token || null,
    accessToken: session?.accessToken || session?.token || null,
    refreshToken: session?.refreshToken || null,
    accessTokenExpiresAt: session?.accessTokenExpiresAt || null,
    refreshTokenExpiresAt: session?.refreshTokenExpiresAt || null,
});

const reducer = (state = initialState, action) => {
    switch (action.type) {
        case LOGIN:
        case SIGNUP:
        case REFRESH_TOKENS: {
            const saved = writeStoredProfile(action.data, { notify: false });
            if (!saved) return state;
            return {
                ...state,
                ...toAuthState(saved),
            };
        }
        case LOGOUT:
            clearStoredProfile({ notify: false, reason: 'logout' });
            return toAuthState(null);
        case UPDATE_WISHLIST: {
            if (!state.user) return state;
            const user = { ...state.user, wishlist: action.data };
            const saved = writeStoredProfile({ user }, { notify: false });
            return saved ? { ...state, ...toAuthState(saved) } : { ...state, user };
        }
        case UPDATE_PROFILE: {
            if (!state.user && !action.data) return state;
            const user = { ...(state.user || {}), ...(action.data || {}) };
            const saved = writeStoredProfile({ user }, { notify: false });
            return saved ? { ...state, ...toAuthState(saved) } : { ...state, user };
        }
        default:
            return state;
    }
};

export default reducer;
