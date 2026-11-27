import {useDispatch} from "react-redux";
import {Navigate, useLocation} from "react-router-dom";
import {useEffect, useState} from "react";
import {logout, verifyUser} from "../../actions/auth";
import Loading from "../loading/Loading";
import {readStoredProfile} from "../../utils/authSession";

const PrivateRoute = ({component, role}) => {
    const dispatch = useDispatch();
    const location = useLocation();

    const storedProfile = readStoredProfile();
    const hasToken = Boolean(storedProfile?.token);

    const [status, setStatus] = useState(() => {
        if (!hasToken) return 'unauthenticated';
        return 'verifying';
    });

    useEffect(() => {
        if (!hasToken) {
            dispatch(logout);
            setStatus('unauthenticated');
            return;
        }

        let isMounted = true;

        const onError = () => {
            if (!isMounted) return;
            localStorage.removeItem('profile');
            dispatch(logout);
            setStatus('unauthenticated');
        };

        const onSuccess = (verifiedUser) => {
            if (!isMounted) return;
            if (!verifiedUser || !verifiedUser._id) {
                localStorage.removeItem('profile');
                dispatch(logout);
                setStatus('unauthenticated');
                return;
            }
            if (role && verifiedUser.role !== role) {
                setStatus('unauthorized');
                return;
            }
            setStatus('authorized');
        };

        dispatch(verifyUser(onSuccess, onError));

        return () => {
            isMounted = false;
        };
    }, [dispatch, role, hasToken, location.pathname]);

    if (!hasToken || status === 'unauthenticated') {
        return (
            <Navigate
                to="/login"
                replace
                state={{
                    from: `${location.pathname}${location.search}`,
                    message: "Please sign in to access this page."
                }}
            />
        );
    }

    if (status === 'unauthorized') {
        return <Navigate to="/401" replace/>;
    }

    if (status === 'authorized') {
        return component;
    }

    return <Loading text={'Verifying access'}/>;
};

export default PrivateRoute;
