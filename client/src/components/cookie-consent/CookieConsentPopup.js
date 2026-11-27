import {useEffect, useState} from "react";
import {Link} from "react-router-dom";
import styles from "./cookieConsentPopup.module.css";
import {getCookieConsent, saveCookieConsent} from "../../utils/tracker";

const CookieConsentPopup = () => {
    const [consent, setConsent] = useState(() => getCookieConsent());

    useEffect(() => {
        const handleUpdate = (e) => {
            setConsent(e?.detail ?? getCookieConsent());
        };
        window.addEventListener('freshmart:cookie-consent-updated', handleUpdate);
        return () => {
            window.removeEventListener('freshmart:cookie-consent-updated', handleUpdate);
        };
    }, []);

    if (consent && consent.status) {
        return null;
    }

    const handleAcceptCookies = () => {
        const saved = saveCookieConsent({
            status: 'accepted',
            personalization: true,
            performance: true,
        });
        setConsent(saved);
    };

    return (
        <aside
            className={styles['cookie-popup']}
            role="dialog"
            aria-live="polite"
            aria-label="Cookie consent notice"
        >
            <h3 className={styles['cookie-title']}>This website uses cookies</h3>
            <p className={styles['cookie-text']}>
                This website uses cookies. For further information on how we use cookies you can
                read our{' '}
                <Link to="/privacy" className={styles['cookie-link']}>
                    Privacy and Cookie notice
                </Link>
            </p>
            <div className={styles['cookie-actions']}>
                <button
                    type="button"
                    onClick={handleAcceptCookies}
                    className={styles['accept-btn']}
                >
                    Accept cookies
                </button>
            </div>
        </aside>
    );
};

export default CookieConsentPopup;
