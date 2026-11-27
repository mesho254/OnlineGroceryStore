import styles from './navigation.module.css';
import Logo from '../../shared/assets/logos.jpg';
import {Link, useLocation, useNavigate} from "react-router-dom";
import {useEffect, useRef, useState} from "react";
import {SEARCH_HIDDEN, SEARCH_VISIBLE} from "./constants/search";
import {useDispatch, useSelector} from "react-redux";
import {useQuery} from "@tanstack/react-query";
import {logout} from "../../actions/auth";
import {UPDATE_PROFILE} from "../../constants/actions/authentication";
import * as api from "../../api";
import {queryClient} from "../../index";
import {trackSearchQuery} from "../../utils/tracker";
import DeliveryReviewModal from "../review-modal/DeliveryReviewModal";

const Navigation = ({cartCount}) => {
    const [search, setSearch] = useState(SEARCH_HIDDEN);
    const [menuActive, setMenuActive] = useState(false);
    const [searchInput, setSearchInput] = useState("");
    const searchElement = useRef();
    const notifMenuRef = useRef(null);
    const profileMenuRef = useRef(null);
    const mobileNavRef = useRef(null);
    const menuToggleRef = useRef(null);
    const navigate = useNavigate();
    const location = useLocation();
    const user = useSelector(state => state.authentication.user);
    const auth = !!user;
    const admin = auth && user.role === 'ADMIN';
    const [dropdown, setDropdown] = useState(false);
    const [notifOpen, setNotifOpen] = useState(false);
    const [notifScope, setNotifScope] = useState('all'); // Admin filter: 'all' | 'mine'
    const [activeReviewModalNotif, setActiveReviewModalNotif] = useState(null);
    const [autoPopupShownId, setAutoPopupShownId] = useState(null);
    const dispatch = useDispatch();

    const fetchScope = admin ? 'all' : 'mine';
    const effectiveNotifScope = admin ? notifScope : 'mine';

    const {data: notifData} = useQuery({
        queryKey: ['notifications', fetchScope],
        queryFn: async () => {
            const res = await api.fetchNotifications(fetchScope, 50);
            return res.data;
        },
        enabled: auth,
        staleTime: 30000,
        refetchOnWindowFocus: false,
        refetchInterval: 45000,
    });

    const allFetchedNotifications = notifData?.notifications || [];
    // Instant 0ms client-side All/Mine toggle for admins with zero extra HTTP calls
    const notifications =
        admin && notifScope === 'mine'
            ? allFetchedNotifications.filter((n) => n.is_mine)
            : allFetchedNotifications;
    const unreadCount =
        admin && notifScope === 'mine'
            ? notifData?.mine_unread_count ?? notifications.filter((n) => !n.read).length
            : notifData?.unread_count || 0;
    const allCount = notifData?.all_count || allFetchedNotifications.length;
    const mineCount =
        notifData?.mine_count ?? allFetchedNotifications.filter((n) => n.is_mine).length;
    const pendingReviewNotif = notifData?.pending_review_notification || null;

    const {data: pendingReviewsData} = useQuery({
        queryKey: ['pendingReviews'],
        queryFn: async () => {
            const res = await api.fetchPendingReviews();
            return res.data;
        },
        enabled: auth,
        staleTime: 2 * 60 * 1000,
        refetchOnWindowFocus: false,
    });
    const pendingReviewsCount = pendingReviewsData?.pending_count || 0;

    // Deduplicated profile hydration via React Query (prevents duplicate /profile XHR calls under StrictMode)
    const {data: hydratedProfileUser} = useQuery({
        queryKey: ['userProfileHydrate', user?._id || user?.email || 'anon'],
        queryFn: async () => {
            const res = await api.fetchUserProfile();
            return res.data?.user || null;
        },
        enabled: auth,
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
    });

    useEffect(() => {
        if (hydratedProfileUser) {
            dispatch({type: UPDATE_PROFILE, data: hydratedProfileUser});
        }
    }, [hydratedProfileUser, dispatch]);

    // Automatically pop up the delivery review modal when a delivered order notification is pending
    useEffect(() => {
        if (
            auth &&
            pendingReviewNotif &&
            pendingReviewNotif._id !== autoPopupShownId &&
            !activeReviewModalNotif
        ) {
            setAutoPopupShownId(pendingReviewNotif._id);
            setActiveReviewModalNotif(pendingReviewNotif);
        }
    }, [auth, pendingReviewNotif, autoPopupShownId, activeReviewModalNotif]);

    useEffect(() => {
        setDropdown(false);
        setNotifOpen(false);
        setMenuActive(false);
    }, [location.pathname, location.search]);

    // Close any open dropdown or mobile drawer when clicking/tapping anywhere outside on the page or pressing Escape
    useEffect(() => {
        if (!dropdown && !notifOpen && !menuActive) return;

        const handlePointerDownOutside = (event) => {
            const target = event.target;
            if (dropdown && profileMenuRef.current && !profileMenuRef.current.contains(target)) {
                setDropdown(false);
            }
            if (notifOpen && notifMenuRef.current && !notifMenuRef.current.contains(target)) {
                setNotifOpen(false);
            }
            if (
                menuActive &&
                mobileNavRef.current &&
                !mobileNavRef.current.contains(target) &&
                (!menuToggleRef.current || !menuToggleRef.current.contains(target))
            ) {
                setMenuActive(false);
            }
        };

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                setDropdown(false);
                setNotifOpen(false);
                setMenuActive(false);
            }
        };

        document.addEventListener('mousedown', handlePointerDownOutside);
        document.addEventListener('touchstart', handlePointerDownOutside);
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('mousedown', handlePointerDownOutside);
            document.removeEventListener('touchstart', handlePointerDownOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [dropdown, notifOpen, menuActive]);

    const handleLogout = () => {
        dispatch(logout);
        setDropdown(false);
        navigate('/login');
    };

    const handleDropDown = () => {
        setNotifOpen(false);
        setDropdown((prev) => !prev);
    };

    const handleToggleNotif = () => {
        setDropdown(false);
        setNotifOpen((prev) => !prev);
    };

    const handleMarkAllRead = async () => {
        try {
            await api.markAllNotificationsRead(effectiveNotifScope);
            queryClient.invalidateQueries({queryKey: ['notifications']});
            queryClient.invalidateQueries({queryKey: ['notificationsPage']});
        } catch {
            // ignore
        }
    };

    const handleNotificationClick = async (notif) => {
        try {
            if (!notif.read && notif._id) {
                await api.markNotificationRead(notif._id);
                queryClient.invalidateQueries({queryKey: ['notifications']});
                queryClient.invalidateQueries({queryKey: ['notificationsPage']});
            }
        } catch {
            // ignore
        }
        setNotifOpen(false);
        if (notif.type === 'DELIVERY_REVIEW' && notif.is_mine !== false) {
            setActiveReviewModalNotif(notif);
        } else if (notif.link && notif.link.startsWith('/seller')) {
            window.open(notif.link, '_blank', 'noopener,noreferrer');
        } else if (notif.link) {
            navigate(notif.link);
        }
    };

    const handleSearch = () => {
        const width = window.innerWidth;
        if (width < 768 && search === SEARCH_HIDDEN && !searchInput.trim()) {
            setSearch(SEARCH_VISIBLE);
            searchElement.current?.focus();
            return;
        }
        if (!searchInput.trim()) {
            navigate('/products');
            return;
        }
        searchElement.current?.blur();
        trackSearchQuery(searchInput.trim());
        navigate(`/products?search=${encodeURIComponent(searchInput.trim())}`);
        setSearch(SEARCH_HIDDEN);
        setSearchInput('');
    };

    const closeMenu = () => {
        setMenuActive(false);
    };

    const isActive = (path) => location.pathname === path;

    return (
        <>
            <header className={styles['header-shell']}>
                <div className={styles['announcement-bar']}>
                    <div className={styles['announcement-inner']}>
                        <span className={styles['announcement-pill']}>⚡ 20-Min Express Delivery</span>
                        <span className={styles['announcement-text']}>
                            100% Farm-Fresh Groceries • Free delivery on orders above 2,000 KES
                        </span>
                        <div className={styles['announcement-links']}>
                            <Link to={'/orders'}>Track Order</Link>
                            <span>•</span>
                            <Link to={'/shipping'}>Track Shipping</Link>
                            <span>•</span>
                            <a href={'/seller'} target={'_blank'} rel={'noopener noreferrer'}>
                                Seller Portal ↗
                            </a>
                        </div>
                    </div>
                </div>

                <div className={styles['wrapper']}>
                    <div className={styles['brand-cluster']}>
                        <Link to={'/'} className={styles['logo']}>
                            <div className={styles['logo-badge']}>
                                <img src={Logo} alt={'FreshMart Grocery'}/>
                            </div>
                            <div className={styles['brand-text']}>
                                <span className={styles['brand-name']}>FreshMart</span>
                                <span className={styles['brand-tag']}>Daily Grocery</span>
                            </div>
                        </Link>

                        <div className={styles['location-pill']} title="Express Delivery Zone">
                            <span className="material-symbols-outlined">location_on</span>
                            <div>
                                <small>Deliver to</small>
                                <strong>Nairobi, KE</strong>
                            </div>
                        </div>
                    </div>

                    <div className={`${styles['search-bar']} ${search === SEARCH_VISIBLE ? styles['search-open'] : ''}`}>
                        <span className={`material-symbols-outlined ${styles['search-lead-icon']}`}>search</span>
                        <input
                            onChange={(e) => setSearchInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            value={searchInput}
                            placeholder={'Search kale, milk, fruits, chicken, snacks...'}
                            ref={searchElement}
                            className={styles['search-input']}
                        />
                        {searchInput && (
                            <button
                                type="button"
                                onClick={() => setSearchInput('')}
                                className={`material-symbols-outlined ${styles['clear-btn']}`}
                            >
                                close
                            </button>
                        )}
                        <button type="button" onClick={handleSearch} className={styles['search-submit']}>
                            Search
                        </button>
                    </div>

                    <nav
                        ref={mobileNavRef}
                        className={`${styles['nav-links']} ${menuActive ? styles['show-menu'] : ''}`}
                    >
                        <div className={styles['mobile-drawer-head']}>
                            <span className={styles['brand-name']}>FreshMart Menu</span>
                            <button type="button" onClick={closeMenu} className={styles['close-menu']}>
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <Link
                            onClick={closeMenu}
                            to={'/'}
                            className={`${styles['nav-item']} ${isActive('/') ? styles['nav-item-active'] : ''}`}
                        >
                            Home
                        </Link>
                        <Link
                            onClick={closeMenu}
                            to={'/products'}
                            className={`${styles['nav-item']} ${isActive('/products') ? styles['nav-item-active'] : ''}`}
                        >
                            Shop Aisles
                        </Link>
                        <Link
                            onClick={closeMenu}
                            to={'/shipping'}
                            className={`${styles['nav-item']} ${isActive('/shipping') ? styles['nav-item-active'] : ''}`}
                        >
                            Track Delivery
                        </Link>
                        {admin && (
                            <Link
                                onClick={closeMenu}
                                to={'/admin'}
                                className={`${styles['nav-item']} ${styles['admin-pill']}`}
                            >
                                Admin
                            </Link>
                        )}

                        <div className={styles['mobile-only-links']}>
                            <a
                                href={'/seller'}
                                target={'_blank'}
                                rel={'noopener noreferrer'}
                                onClick={closeMenu}
                                className={styles['nav-item']}
                            >
                                Seller Portal ↗
                            </a>
                            {auth ? (
                                <>
                                    <Link onClick={closeMenu} to={'/profile'} className={styles['nav-item']}>
                                        My Profile ({user.first_name || 'Account'})
                                    </Link>
                                    <Link onClick={closeMenu} to={'/wishlist'} className={styles['nav-item']}>
                                        Wishlist {user.wishlist?.length > 0 ? `(${user.wishlist.length})` : ''}
                                    </Link>
                                    <Link onClick={closeMenu} to={'/orders'} className={styles['nav-item']}>
                                        My Orders
                                    </Link>
                                    <Link onClick={closeMenu} to={'/notifications'} className={styles['nav-item']}>
                                        Notifications {unreadCount > 0 ? `(${unreadCount})` : ''}
                                    </Link>
                                    <Link onClick={closeMenu} to={'/profile?tab=reviews'} className={styles['nav-item']}>
                                        Pending Reviews {pendingReviewsCount > 0 ? `(${pendingReviewsCount})` : ''}
                                    </Link>
                                    <button type="button" onClick={handleLogout} className={styles['mobile-logout']}>
                                        Logout
                                    </button>
                                </>
                            ) : (
                                <Link onClick={closeMenu} to={'/login'} className={styles['mobile-login-btn']}>
                                    Sign In / Register
                                </Link>
                            )}
                        </div>
                    </nav>

                    <div className={styles['actions']}>
                        {/* Notification Bell Icon & Dropdown */}
                        {auth && (
                            <div ref={notifMenuRef} className={styles['notif-root']}>
                                <button
                                    type="button"
                                    onClick={handleToggleNotif}
                                    className={styles['action-icon-btn']}
                                    title="Notifications"
                                    aria-label="Notifications"
                                >
                                    <span className="material-symbols-outlined">notifications</span>
                                    {unreadCount > 0 && (
                                        <span className={styles['notif-badge']}>
                                            {unreadCount < 10 ? unreadCount : '9+'}
                                        </span>
                                    )}
                                </button>

                                {notifOpen && (
                                    <div className={styles['notif-dropdown']}>
                                        <div className={styles['notif-head']}>
                                            <strong>Notifications ({unreadCount} unread)</strong>
                                            {unreadCount > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={handleMarkAllRead}
                                                    className={styles['mark-all-btn']}
                                                >
                                                    Mark all read
                                                </button>
                                            )}
                                        </div>

                                        {admin && (
                                            <div className={styles['notif-scope-bar']}>
                                                <button
                                                    type="button"
                                                    onClick={() => setNotifScope('all')}
                                                    className={`${styles['notif-scope-btn']} ${
                                                        notifScope === 'all'
                                                            ? styles['notif-scope-active']
                                                            : ''
                                                    }`}
                                                >
                                                    All ({allCount})
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setNotifScope('mine')}
                                                    className={`${styles['notif-scope-btn']} ${
                                                        notifScope === 'mine'
                                                            ? styles['notif-scope-active']
                                                            : ''
                                                    }`}
                                                >
                                                    Mine ({mineCount})
                                                </button>
                                            </div>
                                        )}

                                        <div className={styles['notif-list']}>
                                            {notifications.length === 0 ? (
                                                <div className={styles['notif-empty']}>
                                                    <span className="material-symbols-outlined">notifications_none</span>
                                                    <p>No notifications yet. Order & delivery updates will appear here!</p>
                                                </div>
                                            ) : (
                                                notifications.map((notif) => (
                                                    <div
                                                        key={notif._id}
                                                        onClick={() => handleNotificationClick(notif)}
                                                        className={`${styles['notif-item']} ${!notif.read ? styles['notif-unread'] : ''}`}
                                                    >
                                                        <div className={styles['notif-icon']}>
                                                            {notif.type === 'DELIVERY_REVIEW'
                                                                ? '⭐'
                                                                : notif.type === 'OUT_OF_STOCK' ||
                                                                  notif.type === 'SELLER_OUT_OF_STOCK'
                                                                ? '🚨'
                                                                : notif.type === 'LOW_STOCK' ||
                                                                  notif.type === 'SELLER_LOW_STOCK'
                                                                ? '⚠️'
                                                                : notif.type === 'SELLER_APPLICATION'
                                                                ? '🏪'
                                                                : notif.type === 'SELLER_APPROVAL'
                                                                ? '🎉'
                                                                : notif.type === 'SELLER_ORDER_UPDATE'
                                                                ? '📦'
                                                                : notif.type === 'PRODUCT_APPROVAL_REQUEST'
                                                                ? '📝'
                                                                : notif.type === 'PRODUCT_EDIT_REQUEST'
                                                                ? '✏️'
                                                                : notif.type === 'PRODUCT_APPROVAL_RESULT'
                                                                ? '✅'
                                                                : notif.type === 'SHIPMENT_UPDATE'
                                                                ? '🚚'
                                                                : '🛍️'}
                                                        </div>
                                                        <div className={styles['notif-body']}>
                                                            {admin && notif.is_mine === false && (
                                                                <span className={styles['notif-user-chip']}>
                                                                    👤 {notif.recipient_name || 'User'}
                                                                </span>
                                                            )}
                                                            <div className={styles['notif-title']}>
                                                                {notif.title}
                                                            </div>
                                                            <div className={styles['notif-msg']}>
                                                                {notif.message}
                                                            </div>
                                                            {notif.type === 'DELIVERY_REVIEW' &&
                                                                notif.is_mine !== false && (
                                                                    <span className={styles['rate-cta-chip']}>
                                                                        ★ Rate Products & Seller
                                                                    </span>
                                                                )}
                                                            {(notif.type === 'LOW_STOCK' ||
                                                                notif.type === 'OUT_OF_STOCK') && (
                                                                <span
                                                                    className={`${styles['stock-cta-chip']} ${
                                                                        notif.type === 'OUT_OF_STOCK'
                                                                            ? styles['stock-cta-danger']
                                                                            : ''
                                                                    }`}
                                                                >
                                                                    Restock in Inventory →
                                                                </span>
                                                            )}
                                                            {notif.type === 'SELLER_APPLICATION' && (
                                                                <span className={styles['seller-cta-chip']}>
                                                                    Review Seller Request →
                                                                </span>
                                                            )}
                                                            {notif.type === 'SELLER_APPROVAL' && (
                                                                <span className={styles['seller-cta-chip']}>
                                                                    Open Seller Portal ↗
                                                                </span>
                                                            )}
                                                            {notif.type === 'SELLER_ORDER_UPDATE' && (
                                                                <span className={styles['stock-cta-chip']}>
                                                                    Review & Apply to Order →
                                                                </span>
                                                            )}
                                                            {notif.type === 'PRODUCT_APPROVAL_REQUEST' && (
                                                                <span className={styles['stock-cta-chip']}>
                                                                    Review & Approve Product →
                                                                </span>
                                                            )}
                                                            {notif.type === 'PRODUCT_EDIT_REQUEST' && (
                                                                <span className={styles['stock-cta-chip']}>
                                                                    Review Product Edits →
                                                                </span>
                                                            )}
                                                            {(notif.type === 'SELLER_LOW_STOCK' ||
                                                                notif.type ===
                                                                    'SELLER_OUT_OF_STOCK') && (
                                                                <span
                                                                    className={`${styles['stock-cta-chip']} ${
                                                                        notif.type ===
                                                                        'SELLER_OUT_OF_STOCK'
                                                                            ? styles[
                                                                                  'stock-cta-danger'
                                                                              ]
                                                                            : ''
                                                                    }`}
                                                                >
                                                                    {notif.is_mine === false
                                                                        ? 'View in Inventory →'
                                                                        : 'Restock in Seller Portal ↗'}
                                                                </span>
                                                            )}
                                                            {notif.type === 'PRODUCT_APPROVAL_RESULT' && (
                                                                <span className={styles['seller-cta-chip']}>
                                                                    Open Seller Catalog ↗
                                                                </span>
                                                            )}
                                                            {notif.type === 'SHIPMENT_UPDATE' && (
                                                                <span className={styles['seller-cta-chip']}>
                                                                    Track Live Order →
                                                                </span>
                                                            )}
                                                        </div>
                                                        {!notif.read && <span className={styles['unread-dot']}/>}
                                                    </div>
                                                ))
                                            )}
                                        </div>

                                        <div className={styles['notif-footer-split']}>
                                            <Link
                                                to="/notifications"
                                                onClick={() => setNotifOpen(false)}
                                                className={styles['notif-footer-link']}
                                            >
                                                <span>
                                                    🔔{' '}
                                                    {admin
                                                        ? 'View All Notifications'
                                                        : 'All Notifications'}
                                                </span>
                                                <span>Open →</span>
                                            </Link>
                                            <Link
                                                to="/profile?tab=reviews"
                                                onClick={() => setNotifOpen(false)}
                                                className={styles['notif-footer-link']}
                                            >
                                                <span>
                                                    ★ Pending Reviews
                                                    {pendingReviewsCount > 0
                                                        ? ` (${pendingReviewsCount})`
                                                        : ''}
                                                </span>
                                                <span>View →</span>
                                            </Link>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {auth && (
                            <Link to={'/wishlist'} className={styles['action-icon-btn']} title="Wishlist">
                                <span className="material-symbols-outlined">favorite</span>
                                {user.wishlist?.length > 0 && (
                                    <span className={styles['wish-badge']}>{user.wishlist.length}</span>
                                )}
                            </Link>
                        )}

                        <Link to={'/cart'} className={styles['cart-pill']}>
                            <span className="material-symbols-outlined">shopping_bag</span>
                            <span className={styles['cart-label']}>Cart</span>
                            <span className={styles['cart-counter']}>
                                {cartCount ? (cartCount < 100 ? cartCount : '99+') : 0}
                            </span>
                        </Link>

                        {auth ? (
                            <div ref={profileMenuRef} className={styles['profile-menu-root']}>
                                <button
                                    type="button"
                                    onClick={handleDropDown}
                                    className={styles['profile-trigger']}
                                >
                                    <span className={styles['avatar-circle']}>
                                        {user.avatar ? (
                                            <img
                                                src={user.avatar}
                                                alt={user.first_name || 'Profile'}
                                                className={styles['avatar-img']}
                                            />
                                        ) : (
                                            (user.first_name || user.email || 'U')
                                                .charAt(0)
                                                .toUpperCase()
                                        )}
                                    </span>
                                    <span className={styles['profile-name']}>
                                        {user.first_name || 'Account'}
                                    </span>
                                    <span className="material-symbols-outlined">expand_more</span>
                                </button>

                                {dropdown && (
                                    <div className={styles['account-dropdown']}>
                                        <div className={styles['dropdown-header']}>
                                            <div className={styles['dropdown-user-row']}>
                                                <span className={styles['avatar-circle']}>
                                                    {user.avatar ? (
                                                        <img
                                                            src={user.avatar}
                                                            alt={user.first_name || 'Profile'}
                                                            className={styles['avatar-img']}
                                                        />
                                                    ) : (
                                                        (
                                                            user.first_name ||
                                                            user.email ||
                                                            'U'
                                                        )
                                                            .charAt(0)
                                                            .toUpperCase()
                                                    )}
                                                </span>
                                                <div className={styles['dropdown-user-meta']}>
                                                    <strong>
                                                        {[user.first_name, user.last_name]
                                                            .filter(Boolean)
                                                            .join(' ') || 'Customer'}
                                                    </strong>
                                                    <small>{user.email}</small>
                                                </div>
                                            </div>
                                        </div>
                                        <Link to={'/profile'} onClick={() => setDropdown(false)}>
                                            <span className="material-symbols-outlined">person</span>
                                            My Profile
                                        </Link>
                                        <Link to={'/wishlist'} onClick={() => setDropdown(false)}>
                                            <span className="material-symbols-outlined">favorite</span>
                                            Wishlist {user.wishlist?.length > 0 ? `(${user.wishlist.length})` : ''}
                                        </Link>
                                        <Link to={'/orders'} onClick={() => setDropdown(false)}>
                                            <span className="material-symbols-outlined">receipt_long</span>
                                            Track Orders
                                        </Link>
                                        <Link
                                            to={'/notifications'}
                                            onClick={() => setDropdown(false)}
                                            className={styles['dropdown-review-link']}
                                        >
                                            <span className="material-symbols-outlined">notifications</span>
                                            <span className={styles['dropdown-link-label']}>Notifications</span>
                                            {unreadCount > 0 && (
                                                <span className={styles['dropdown-count-pill']}>
                                                    {unreadCount}
                                                </span>
                                            )}
                                        </Link>
                                        <Link
                                            to={'/profile?tab=reviews'}
                                            onClick={() => setDropdown(false)}
                                            className={styles['dropdown-review-link']}
                                        >
                                            <span className="material-symbols-outlined">rate_review</span>
                                            <span className={styles['dropdown-link-label']}>Pending Reviews</span>
                                            {pendingReviewsCount > 0 && (
                                                <span className={styles['dropdown-count-pill']}>
                                                    {pendingReviewsCount}
                                                </span>
                                            )}
                                        </Link>
                                        <a
                                            href={'/seller'}
                                            target={'_blank'}
                                            rel={'noopener noreferrer'}
                                            onClick={() => setDropdown(false)}
                                        >
                                            <span className="material-symbols-outlined">store</span>
                                            {user.role === 'SELLER' ||
                                            user.seller_profile?.status === 'APPROVED'
                                                ? 'My Seller Portal ↗'
                                                : 'Seller Portal ↗'}
                                        </a>
                                        {admin && (
                                            <Link to={'/admin'} onClick={() => setDropdown(false)}>
                                                <span className="material-symbols-outlined">admin_panel_settings</span>
                                                Admin Dashboard
                                            </Link>
                                        )}
                                        <button
                                            type="button"
                                            onClick={handleLogout}
                                            className={styles['dropdown-logout']}
                                        >
                                            <span className="material-symbols-outlined">logout</span>
                                            Sign Out
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <Link to={'/login'} className={styles['signin-pill']}>
                                <span className="material-symbols-outlined">person</span>
                                <span>Sign In</span>
                            </Link>
                        )}

                        <button
                            ref={menuToggleRef}
                            type="button"
                            onClick={() => setMenuActive(true)}
                            className={styles['menu-toggle']}
                            aria-label="Open menu"
                        >
                            <span className="material-symbols-outlined">menu</span>
                        </button>
                    </div>
                </div>
            </header>

            {activeReviewModalNotif && (
                <DeliveryReviewModal
                    notification={activeReviewModalNotif}
                    onClose={() => setActiveReviewModalNotif(null)}
                />
            )}
        </>
    );
};

export default Navigation;
