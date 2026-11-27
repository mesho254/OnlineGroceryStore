import {useEffect, useLayoutEffect} from 'react';
import {useLocation} from "react-router-dom";

function ScrollToTop() {
    const {pathname, search} = useLocation();

    useEffect(() => {
        if ('scrollRestoration' in window.history) {
            window.history.scrollRestoration = 'manual';
        }
        window.scrollTo({top: 0, left: 0, behavior: 'instant'});

        const handleBeforeUnload = () => {
            window.scrollTo(0, 0);
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, []);

    useLayoutEffect(() => {
        window.scrollTo({top: 0, left: 0, behavior: 'instant'});
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
    }, [pathname, search]);

    return null;
}

export default ScrollToTop;
