import styles from './sellerPortal.module.css';
import {useEffect, useRef, useState} from "react";
import {useLocation, useNavigate} from "react-router-dom";
import {useDispatch, useSelector} from "react-redux";
import {useQuery} from "@tanstack/react-query";
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
} from "recharts";
import * as api from "../../api";
import {queryClient} from "../../index";
import {LOGIN, UPDATE_PROFILE} from "../../constants/actions/authentication";
import {readStoredProfile, writeStoredProfile} from "../../utils/authSession";
import {logout} from "../../actions/auth";
import Loading from "../../components/loading/Loading";
import TablePagination from "../../components/table-pagination/TablePagination";
import SellerProductWizard from "./SellerProductWizard";
import {formatKES} from "../../utils/pricing";
import {getStatusMeta} from "../../utils/orderStatuses";

const CATEGORIES = [
    'Fruits and Vegetables',
    'Meat Poultry and Seafood',
    'Dairy and Eggs',
    'Breakfast',
    'Beverages',
    'Chocolate and Candy',
    'Chips and Crackers',
    'Ice Cream',
];

const SELLER_PROPOSABLE_STATUSES = [
    'PENDING_CONFIRMATION',
    'WAITING_TO_BE_SHIPPED',
    'SHIPPED',
    'AVAILABLE_FOR_PICKUP',
    'DELIVERED',
    'RETURN_IN_PROGRESS',
    'RETURNED',
    'FAILED_DELIVERY',
    'CANCELLED',
];

const formatDateTime = (val) => {
    if (!val) return 'Recent';
    const d = new Date(val);
    if (isNaN(d.getTime())) return 'Recent';
    return d.toLocaleDateString('en-KE', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

const resizeAvatarFileToDataUrl = (file, size = 320, quality = 0.86) =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d');
                const minSide = Math.min(img.width, img.height);
                const sx = (img.width - minSide) / 2;
                const sy = (img.height - minSide) / 2;
                ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = () => reject(new Error('Could not decode image file.'));
            img.src = ev.target.result;
        };
        reader.onerror = () => reject(new Error('Could not read file.'));
        reader.readAsDataURL(file);
    });

const SellerPortal = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const reduxUser = useSelector((state) => state.authentication.user);

    const searchParams = new URLSearchParams(location.search);
    const activeTab = searchParams.get('tab') || 'overview';

    // Auth / Registration gateway state
    const [authMode, setAuthMode] = useState('LOGIN'); // 'LOGIN' | 'REGISTER'
    const [loginEmail, setLoginEmail] = useState('');
    const [loginPassword, setLoginPassword] = useState('');
    const [regForm, setRegForm] = useState({
        first_name: '',
        last_name: '',
        email: '',
        password: '',
        phone: '',
        store_name: '',
        business_location: 'Nairobi, Kenya',
        category_focus: 'Fruits and Vegetables',
        business_description: '',
    });
    const [authBusy, setAuthBusy] = useState(false);

    const [toast, setToast] = useState('');
    const [error, setError] = useState('');

    // Products Tab State
    const [prodSearch, setProdSearch] = useState('');
    const [prodPage, setProdPage] = useState(1);
    const [prodRowsPerPage, setProdRowsPerPage] = useState(5);
    const [showProductForm, setShowProductForm] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);

    // Orders Tab State
    const [orderSearch, setOrderSearch] = useState('');
    const [orderFilter, setOrderFilter] = useState('ALL');
    const [orderPage, setOrderPage] = useState(1);
    const [orderRowsPerPage, setOrderRowsPerPage] = useState(5);
    const [orderDrafts, setOrderDrafts] = useState({});
    const [updatingOrderId, setUpdatingOrderId] = useState(null);

    // Reviews Tab State
    const [reviewPage, setReviewPage] = useState(1);
    const [reviewRowsPerPage, setReviewRowsPerPage] = useState(5);

    // Seller Notifications Bell & Tab State
    const sellerNotifRef = useRef(null);
    const [notifOpen, setNotifOpen] = useState(false);
    const [notifFilter, setNotifFilter] = useState('ALL'); // 'ALL' | 'UNREAD' | 'STOCK' | 'ORDERS' | 'APPROVALS'
    const [notifSearch, setNotifSearch] = useState('');
    const [notifPage, setNotifPage] = useState(1);
    const [notifRowsPerPage, setNotifRowsPerPage] = useState(5);

    // Profile & Store Settings Tab State
    const avatarInputRef = useRef(null);
    const [profileForm, setProfileForm] = useState({
        first_name: '',
        last_name: '',
        phone: '',
        bio: '',
        avatar: '',
        store_name: '',
        business_phone: '',
        business_location: 'Nairobi, Kenya',
        category_focus: 'Fruits and Vegetables',
        business_description: '',
    });
    const [savingProfile, setSavingProfile] = useState(false);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [pwForm, setPwForm] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
    });
    const [savingPassword, setSavingPassword] = useState(false);

    const hasToken = Boolean(readStoredProfile()?.token);

    const {
        data: statusData,
        isPending: loadingStatus,
        refetch: refetchStatus,
    } = useQuery({
        queryKey: ['sellerStatus', reduxUser?._id || 'anon'],
        queryFn: async () => {
            const res = await api.fetchSellerStatus();
            if (res.data?.user) {
                dispatch({type: UPDATE_PROFILE, data: res.data.user});
            }
            return res.data;
        },
        enabled: hasToken,
        staleTime: 0,
        refetchOnMount: 'always',
        refetchOnWindowFocus: true,
    });

    const currentUser = statusData?.user || reduxUser || null;
    const sellerProfile = statusData?.seller_profile || currentUser?.seller_profile || {status: 'NONE'};
    const sellerStatus = sellerProfile?.status || 'NONE';
    const isApproved = sellerStatus === 'APPROVED';

    // Keep Profile & Store Settings form hydrated from latest fetched user + store profile
    useEffect(() => {
        if (!currentUser) return;
        setProfileForm({
            first_name: currentUser.first_name || '',
            last_name: currentUser.last_name || '',
            phone: currentUser.phone || '',
            bio: currentUser.bio || '',
            avatar: currentUser.avatar || '',
            store_name: sellerProfile?.store_name || '',
            business_phone: sellerProfile?.business_phone || currentUser.phone || '',
            business_location: sellerProfile?.business_location || 'Nairobi, Kenya',
            category_focus: sellerProfile?.category_focus || 'Fruits and Vegetables',
            business_description: sellerProfile?.business_description || '',
        });
    }, [
        currentUser?._id,
        currentUser?.first_name,
        currentUser?.last_name,
        currentUser?.phone,
        currentUser?.bio,
        currentUser?.avatar,
        sellerProfile?.store_name,
        sellerProfile?.business_phone,
        sellerProfile?.business_location,
        sellerProfile?.category_focus,
        sellerProfile?.business_description,
    ]);

    const {data: overview, isPending: loadingOverview} = useQuery({
        queryKey: ['sellerOverview', currentUser?._id],
        queryFn: async () => (await api.fetchSellerOverview()).data,
        enabled: hasToken && isApproved,
        staleTime: 0,
        refetchOnMount: 'always',
    });

    const {data: myProducts = [], isPending: loadingProducts} = useQuery({
        queryKey: ['sellerProducts', currentUser?._id],
        queryFn: async () => {
            const res = await api.fetchSellerProducts();
            return Array.isArray(res.data) ? res.data : [];
        },
        enabled: hasToken && isApproved && (activeTab === 'products' || activeTab === 'overview'),
        staleTime: 0,
        refetchOnMount: 'always',
    });

    const {data: ordersPayload, isPending: loadingOrders} = useQuery({
        queryKey: ['sellerOrders', currentUser?._id],
        queryFn: async () => (await api.fetchSellerOrders()).data,
        enabled: hasToken && isApproved && activeTab === 'orders',
        staleTime: 0,
        refetchOnMount: 'always',
    });

    const {data: reviewsPayload, isPending: loadingReviews} = useQuery({
        queryKey: ['sellerReviews', currentUser?._id],
        queryFn: async () => (await api.fetchSellerReviews()).data,
        enabled: hasToken && isApproved && activeTab === 'ratings',
        staleTime: 0,
        refetchOnMount: 'always',
    });

    const {data: sellerNotifData, isPending: loadingSellerNotifs} = useQuery({
        queryKey: ['sellerNotifications', currentUser?._id],
        queryFn: async () => (await api.fetchSellerNotifications()).data,
        enabled: hasToken && isApproved,
        staleTime: 0,
        refetchOnMount: 'always',
        refetchOnWindowFocus: true,
        refetchInterval: 15000,
    });

    const sellerNotifications = sellerNotifData?.notifications || [];
    const sellerUnreadNotifs = sellerNotifData?.unread_count || 0;
    const sellerStockAlerts = sellerNotifications.filter(
        (n) => n.type === 'SELLER_LOW_STOCK' || n.type === 'SELLER_OUT_OF_STOCK'
    );

    useEffect(() => {
        if (!notifOpen) return;
        const onPointerDown = (ev) => {
            if (sellerNotifRef.current && !sellerNotifRef.current.contains(ev.target)) {
                setNotifOpen(false);
            }
        };
        const onKeyDown = (ev) => {
            if (ev.key === 'Escape') setNotifOpen(false);
        };
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('touchstart', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('touchstart', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [notifOpen]);

    useEffect(() => {
        setNotifPage(1);
    }, [notifFilter, notifSearch, notifRowsPerPage]);

    useEffect(() => {
        setProdPage(1);
    }, [prodSearch, prodRowsPerPage]);

    useEffect(() => {
        setOrderPage(1);
    }, [orderSearch, orderFilter, orderRowsPerPage]);

    const showSuccess = (msg) => {
        setToast(msg);
        setError('');
        setTimeout(() => setToast(''), 4500);
    };

    const setTab = (tab) => {
        setError('');
        setToast('');
        navigate(tab === 'overview' ? '/seller' : `/seller?tab=${tab}`);
    };

    const handleSellerSignIn = async (e) => {
        e.preventDefault();
        setAuthBusy(true);
        setError('');
        try {
            const res = await api.authLogin(loginEmail.trim(), loginPassword);
            const {user} = res.data;
            dispatch({type: LOGIN, data: res.data});
            queryClient.invalidateQueries({queryKey: ['sellerStatus']});
            showSuccess(`✓ Signed in as ${user.first_name || user.email}`);
        } catch (err) {
            setError(err.response?.data?.message || 'Invalid email or password.');
        } finally {
            setAuthBusy(false);
        }
    };

    const handleSellerRegister = async (e) => {
        e.preventDefault();
        setAuthBusy(true);
        setError('');
        try {
            const res = await api.registerSeller(regForm);
            dispatch({type: LOGIN, data: res.data});
            queryClient.invalidateQueries({queryKey: ['sellerStatus']});
            showSuccess(res.data?.message || '✓ Seller registration submitted for admin approval!');
        } catch (err) {
            setError(err.response?.data?.message || 'Seller registration failed.');
        } finally {
            setAuthBusy(false);
        }
    };

    const handleExistingUserApply = async (e) => {
        e.preventDefault();
        setAuthBusy(true);
        setError('');
        try {
            const res = await api.applyAsSeller({
                store_name: regForm.store_name,
                business_phone: regForm.phone || currentUser?.phone || '',
                business_location: regForm.business_location,
                category_focus: regForm.category_focus,
                business_description: regForm.business_description,
            });
            if (res.data?.user) {
                dispatch({type: UPDATE_PROFILE, data: res.data.user});
            }
            refetchStatus();
            showSuccess(res.data?.message || '✓ Seller application sent to Admin for approval!');
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to submit seller application.');
        } finally {
            setAuthBusy(false);
        }
    };

    const handleSignOut = () => {
        dispatch(logout);
        queryClient.clear();
        setLoginEmail('');
        setLoginPassword('');
    };

    const syncLocalUser = (updatedUser) => {
        if (!updatedUser) return;
        dispatch({type: UPDATE_PROFILE, data: updatedUser});
        writeStoredProfile({user: updatedUser}, {notify: false});
    };

    const handleAvatarUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            return setError('Please choose a valid image file (JPG, PNG, WebP).');
        }
        setUploadingAvatar(true);
        setError('');
        try {
            const dataUrl = await resizeAvatarFileToDataUrl(file);
            setProfileForm((prev) => ({...prev, avatar: dataUrl}));
            const res = await api.updateSellerProfile({avatar: dataUrl});
            if (res.data?.user) {
                syncLocalUser(res.data.user);
            }
            refetchStatus();
            showSuccess('✓ Profile photo updated!');
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Could not update profile photo.');
        } finally {
            setUploadingAvatar(false);
            if (avatarInputRef.current) avatarInputRef.current.value = '';
        }
    };

    const handleRemoveAvatar = async () => {
        setUploadingAvatar(true);
        setError('');
        try {
            const res = await api.updateSellerProfile({avatar: ''});
            setProfileForm((prev) => ({...prev, avatar: ''}));
            if (res.data?.user) {
                syncLocalUser(res.data.user);
            }
            refetchStatus();
            showSuccess('✓ Profile photo removed.');
        } catch (err) {
            setError(err.response?.data?.message || 'Could not remove photo.');
        } finally {
            setUploadingAvatar(false);
        }
    };

    const handleSaveSellerProfile = async (e) => {
        e.preventDefault();
        if (!profileForm.first_name.trim() || !profileForm.store_name.trim()) {
            return setError('Your first name and store name are required.');
        }
        setSavingProfile(true);
        setError('');
        try {
            const res = await api.updateSellerProfile(profileForm);
            if (res.data?.user) {
                syncLocalUser(res.data.user);
            }
            refetchStatus();
            queryClient.invalidateQueries({queryKey: ['sellerOverview']});
            queryClient.invalidateQueries({queryKey: ['sellerProducts']});
            queryClient.invalidateQueries({queryKey: ['products']});
            showSuccess(res.data?.message || '✓ Personal & store details saved!');
        } catch (err) {
            setError(err.response?.data?.message || 'Could not save profile changes.');
        } finally {
            setSavingProfile(false);
        }
    };

    const handleChangeSellerPassword = async (e) => {
        e.preventDefault();
        if (pwForm.newPassword.length < 8) {
            return setError('New password must be at least 8 characters long.');
        }
        if (pwForm.newPassword !== pwForm.confirmPassword) {
            return setError('New password and confirmation do not match.');
        }
        setSavingPassword(true);
        setError('');
        try {
            await api.changeUserPassword(pwForm.currentPassword, pwForm.newPassword);
            setPwForm({currentPassword: '', newPassword: '', confirmPassword: ''});
            showSuccess('✓ Password changed successfully!');
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to update password.');
        } finally {
            setSavingPassword(false);
        }
    };

    // Product Add / Edit Handlers (5-Step Wizard matching Admin Add Product)
    const openCreateProduct = () => {
        setEditingProduct(null);
        setShowProductForm(true);
    };

    const openEditProduct = (prod) => {
        setEditingProduct(prod);
        setShowProductForm(true);
    };

    const handleProductWizardSaved = (msg) => {
        setShowProductForm(false);
        setEditingProduct(null);
        queryClient.invalidateQueries({queryKey: ['sellerProducts']});
        queryClient.invalidateQueries({queryKey: ['sellerOverview']});
        queryClient.invalidateQueries({queryKey: ['products']});
        showSuccess(msg);
    };

    const handleDeleteProduct = async (prod) => {
        if (!window.confirm(`Delete "${prod.name}" from your store catalog?`)) return;
        setError('');
        try {
            await api.deleteSellerProduct(prod.product_id);
            queryClient.invalidateQueries({queryKey: ['sellerProducts']});
            queryClient.invalidateQueries({queryKey: ['sellerOverview']});
            queryClient.invalidateQueries({queryKey: ['products']});
            showSuccess(`✓ Removed "${prod.name}" from your catalog.`);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to delete product.');
        }
    };

    // Seller Order Status Proposal (Updates Admin Queue Only — NOT Customer Directly!)
    const getOrderDraft = (ord) =>
        orderDrafts[ord.order_id] || {
            status: ord.seller_update?.proposed_status || ord.customer_status || 'WAITING_TO_BE_SHIPPED',
            note: ord.seller_update?.note || '',
        };

    const updateOrderDraft = (orderId, field, value, ord) => {
        setOrderDrafts((prev) => ({
            ...prev,
            [orderId]: {
                ...getOrderDraft(ord),
                [field]: value,
            },
        }));
    };

    const handleProposeOrderStatus = async (ord) => {
        const draft = getOrderDraft(ord);
        setUpdatingOrderId(ord.order_id);
        setError('');
        try {
            const res = await api.proposeSellerOrderStatus(ord.order_id, draft.status, draft.note);
            queryClient.invalidateQueries({queryKey: ['sellerOrders']});
            queryClient.invalidateQueries({queryKey: ['sellerOverview']});
            showSuccess(
                res.data?.message ||
                    `✓ Sent "${getStatusMeta(draft.status).label}" update for Order #${ord.order_id} to Admin for review!`
            );
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to submit order status update.');
        } finally {
            setUpdatingOrderId(null);
        }
    };

    const handleMarkAllSellerNotifsRead = async () => {
        try {
            await api.markSellerNotificationsRead();
            queryClient.invalidateQueries({queryKey: ['sellerNotifications']});
        } catch {
            // ignore
        }
    };

    const handleOpenSellerNotification = async (notif) => {
        if (!notif.read && notif._id) {
            api.markNotificationRead(notif._id)
                .then(() => queryClient.invalidateQueries({queryKey: ['sellerNotifications']}))
                .catch(() => {});
        }
        setNotifOpen(false);
        if (notif.type === 'SELLER_LOW_STOCK' || notif.type === 'SELLER_OUT_OF_STOCK') {
            setTab('products');
        } else if (notif.type === 'ORDER_CONFIRMED') {
            setTab('orders');
        } else if (notif.type === 'PRODUCT_APPROVAL_RESULT') {
            setTab('products');
        } else if (notif.link && notif.link.includes('tab=')) {
            const tabParam = new URLSearchParams(notif.link.split('?')[1] || '').get('tab');
            if (tabParam) setTab(tabParam);
        }
    };

    const getSellerNotifIcon = (type) => {
        if (type === 'SELLER_OUT_OF_STOCK') return '🚨';
        if (type === 'SELLER_LOW_STOCK') return '⚠️';
        if (type === 'PRODUCT_APPROVAL_RESULT') return '✅';
        if (type === 'SELLER_APPROVAL') return '🎉';
        if (type === 'ORDER_CONFIRMED') return '🛒';
        return '🔔';
    };

    const sellerFullName =
        [currentUser?.first_name, currentUser?.last_name].filter(Boolean).join(' ') ||
        currentUser?.email ||
        'Seller Account';
    const sellerInitials =
        (
            (currentUser?.first_name?.charAt(0) || '') + (currentUser?.last_name?.charAt(0) || '')
        ).toUpperCase() || (sellerFullName.charAt(0) || 'S').toUpperCase();

    // ==================== PORTAL HEADER (SHOWN IN ALL STATES) ====================
    const renderPortalTopBar = () => (
        <header className={styles['portal-topbar']}>
            <div className={styles['topbar-brand']}>
                <div className={styles['brand-mark']}>
                    <span className="material-symbols-outlined">storefront</span>
                </div>
                <div>
                    <strong>FreshMart Seller Center</strong>
                    <small>
                        {isApproved
                            ? `${sellerProfile.store_name} • Verified Partner`
                            : 'Multi-Vendor Marketplace Portal'}
                    </small>
                </div>
            </div>

            <div className={styles['topbar-actions']}>
                {hasToken && isApproved && (
                    <div ref={sellerNotifRef} className={styles['seller-notif-root']}>
                        <button
                            type="button"
                            onClick={() => setNotifOpen((prev) => !prev)}
                            className={styles['seller-bell-btn']}
                            title="Seller Store Notifications"
                            aria-label="Seller Store Notifications"
                        >
                            <span className="material-symbols-outlined">notifications</span>
                            {sellerUnreadNotifs > 0 && (
                                <span className={styles['seller-bell-badge']}>
                                    {sellerUnreadNotifs < 10 ? sellerUnreadNotifs : '9+'}
                                </span>
                            )}
                        </button>

                        {notifOpen && (
                            <div className={styles['seller-notif-dropdown']}>
                                <div className={styles['seller-notif-head']}>
                                    <strong>Store Notifications ({sellerUnreadNotifs} unread)</strong>
                                    {sellerUnreadNotifs > 0 && (
                                        <button
                                            type="button"
                                            onClick={handleMarkAllSellerNotifsRead}
                                            className={styles['seller-mark-all']}
                                        >
                                            Mark all read
                                        </button>
                                    )}
                                </div>
                                <div className={styles['seller-notif-list']}>
                                    {sellerNotifications.length === 0 ? (
                                        <div className={styles['seller-notif-empty']}>
                                            <span className="material-symbols-outlined">
                                                notifications_none
                                            </span>
                                            <p>
                                                No store alerts yet. Orders, approved-product low
                                                stock warnings, and admin approvals appear here.
                                            </p>
                                        </div>
                                    ) : (
                                        sellerNotifications.slice(0, 12).map((n) => (
                                            <div
                                                key={n._id}
                                                onClick={() => handleOpenSellerNotification(n)}
                                                className={`${styles['seller-notif-item']} ${
                                                    !n.read ? styles['seller-notif-unread'] : ''
                                                }`}
                                            >
                                                <div className={styles['seller-notif-icon']}>
                                                    {getSellerNotifIcon(n.type)}
                                                </div>
                                                <div className={styles['seller-notif-body']}>
                                                    <strong>{n.title}</strong>
                                                    <p>{n.message}</p>
                                                    <small>{formatDateTime(n.created_at)}</small>
                                                </div>
                                                {!n.read && (
                                                    <span className={styles['seller-unread-dot']}/>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setNotifOpen(false);
                                        setTab('notifications');
                                    }}
                                    className={styles['seller-notif-footer']}
                                >
                                    <span>🔔 All Seller Notifications ({sellerNotifications.length})</span>
                                    <span>View All →</span>
                                </button>
                            </div>
                        )}
                    </div>
                )}
                {hasToken && currentUser && (
                    <button
                        type="button"
                        onClick={() => isApproved && setTab('profile')}
                        title={isApproved ? 'View & edit your Seller Profile' : currentUser.email}
                        className={`${styles['topbar-profile-pill']} ${
                            isApproved && activeTab === 'profile'
                                ? styles['topbar-profile-active']
                                : ''
                        }`}
                    >
                        <span className={styles['topbar-avatar']}>
                            {currentUser.avatar ? (
                                <img src={currentUser.avatar} alt={sellerFullName}/>
                            ) : (
                                sellerInitials
                            )}
                        </span>
                        <span className={styles['topbar-user-meta']}>
                            <strong>{sellerFullName}</strong>
                            <small>{currentUser.email}</small>
                        </span>
                        {isApproved && (
                            <span
                                className="material-symbols-outlined"
                                style={{fontSize: '1rem', color: '#94a3b8'}}
                            >
                                manage_accounts
                            </span>
                        )}
                    </button>
                )}
                <a
                    href="/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles['storefront-link']}
                >
                    <span className="material-symbols-outlined">open_in_new</span>
                    <span>Customer Storefront</span>
                </a>
                {currentUser?.role === 'ADMIN' && (
                    <a
                        href="/admin?tab=sellers"
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles['admin-link']}
                    >
                        <span className="material-symbols-outlined">admin_panel_settings</span>
                        <span>Admin Sellers</span>
                    </a>
                )}
                {hasToken && (
                    <button type="button" onClick={handleSignOut} className={styles['signout-btn']}>
                        <span className="material-symbols-outlined">logout</span>
                        <span>Sign Out</span>
                    </button>
                )}
            </div>
        </header>
    );

    // ==================== STATE 1: NOT SIGNED IN (LOGIN / REGISTER GATEWAY) ====================
    if (!hasToken) {
        return (
            <div className={styles['portal-shell']}>
                {renderPortalTopBar()}

                <div className={styles['auth-stage']}>
                    <div className={styles['auth-card']}>
                        <div className={styles['auth-intro']}>
                            <span className={styles['eyebrow']}>SELL ON FRESHMART</span>
                            <h1>Grow Your Farm or Grocery Business</h1>
                            <p>
                                List products, track orders & earnings, monitor customer ratings,
                                and coordinate express 20-minute deliveries across Kenya.
                            </p>
                        </div>

                        {toast && <div className={styles['toast-ok']}>{toast}</div>}
                        {error && <div className={styles['toast-err']}>{error}</div>}

                        <div className={styles['auth-tabs']}>
                            <button
                                type="button"
                                onClick={() => {
                                    setAuthMode('LOGIN');
                                    setError('');
                                }}
                                className={authMode === 'LOGIN' ? styles['auth-tab-active'] : ''}
                            >
                                Seller Sign In
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setAuthMode('REGISTER');
                                    setError('');
                                }}
                                className={authMode === 'REGISTER' ? styles['auth-tab-active'] : ''}
                            >
                                Register New Seller Store
                            </button>
                        </div>

                        {authMode === 'LOGIN' ? (
                            <form onSubmit={handleSellerSignIn} className={styles['form']}>
                                <div className={styles['field']}>
                                    <label>Seller Email *</label>
                                    <input
                                        type="email"
                                        required
                                        value={loginEmail}
                                        onChange={(e) => setLoginEmail(e.target.value)}
                                        placeholder="farm@example.com"
                                    />
                                </div>
                                <div className={styles['field']}>
                                    <label>Password *</label>
                                    <input
                                        type="password"
                                        required
                                        value={loginPassword}
                                        onChange={(e) => setLoginPassword(e.target.value)}
                                        placeholder="Enter your password"
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={authBusy}
                                    className={`btn1 ${styles['full-btn']}`}
                                >
                                    <span>{authBusy ? 'Signing In...' : 'Access Seller Portal'}</span>
                                    <span className="material-symbols-outlined">arrow_forward</span>
                                </button>
                            </form>
                        ) : (
                            <form onSubmit={handleSellerRegister} className={styles['form']}>
                                <div className={styles['row-2']}>
                                    <div className={styles['field']}>
                                        <label>First Name *</label>
                                        <input
                                            type="text"
                                            required
                                            value={regForm.first_name}
                                            onChange={(e) =>
                                                setRegForm({...regForm, first_name: e.target.value})
                                            }
                                            placeholder="Jane"
                                        />
                                    </div>
                                    <div className={styles['field']}>
                                        <label>Last Name</label>
                                        <input
                                            type="text"
                                            value={regForm.last_name}
                                            onChange={(e) =>
                                                setRegForm({...regForm, last_name: e.target.value})
                                            }
                                            placeholder="Wanjiku"
                                        />
                                    </div>
                                </div>

                                <div className={styles['row-2']}>
                                    <div className={styles['field']}>
                                        <label>Business Email *</label>
                                        <input
                                            type="email"
                                            required
                                            value={regForm.email}
                                            onChange={(e) =>
                                                setRegForm({...regForm, email: e.target.value})
                                            }
                                            placeholder="orders@greenvalleyfarm.co.ke"
                                        />
                                    </div>
                                    <div className={styles['field']}>
                                        <label>Password (Min 6 chars) *</label>
                                        <input
                                            type="password"
                                            required
                                            minLength={6}
                                            value={regForm.password}
                                            onChange={(e) =>
                                                setRegForm({...regForm, password: e.target.value})
                                            }
                                            placeholder="Create password"
                                        />
                                    </div>
                                </div>

                                <div className={styles['row-2']}>
                                    <div className={styles['field']}>
                                        <label>Store / Farm Name *</label>
                                        <input
                                            type="text"
                                            required
                                            value={regForm.store_name}
                                            onChange={(e) =>
                                                setRegForm({...regForm, store_name: e.target.value})
                                            }
                                            placeholder="e.g. Rift Valley Organic Farms"
                                        />
                                    </div>
                                    <div className={styles['field']}>
                                        <label>Business Phone *</label>
                                        <input
                                            type="tel"
                                            required
                                            value={regForm.phone}
                                            onChange={(e) =>
                                                setRegForm({...regForm, phone: e.target.value})
                                            }
                                            placeholder="0712 345 678"
                                        />
                                    </div>
                                </div>

                                <div className={styles['row-2']}>
                                    <div className={styles['field']}>
                                        <label>Location / City *</label>
                                        <input
                                            type="text"
                                            required
                                            value={regForm.business_location}
                                            onChange={(e) =>
                                                setRegForm({
                                                    ...regForm,
                                                    business_location: e.target.value,
                                                })
                                            }
                                            placeholder="Nairobi, Limuru, Naivasha..."
                                        />
                                    </div>
                                    <div className={styles['field']}>
                                        <label>Primary Product Category</label>
                                        <select
                                            value={regForm.category_focus}
                                            onChange={(e) =>
                                                setRegForm({
                                                    ...regForm,
                                                    category_focus: e.target.value,
                                                })
                                            }
                                        >
                                            {CATEGORIES.map((c) => (
                                                <option key={c} value={c}>
                                                    {c}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className={styles['field']}>
                                    <label>About Your Farm / Store</label>
                                    <textarea
                                        rows={3}
                                        value={regForm.business_description}
                                        onChange={(e) =>
                                            setRegForm({
                                                ...regForm,
                                                business_description: e.target.value,
                                            })
                                        }
                                        placeholder="Describe the fresh groceries or products you supply..."
                                    />
                                </div>

                                <div className={styles['approval-note']}>
                                    <span className="material-symbols-outlined">verified_user</span>
                                    <span>
                                        All new seller accounts require{' '}
                                        <strong>Admin approval</strong> before accessing the Seller
                                        Portal and publishing products.
                                    </span>
                                </div>

                                <button
                                    type="submit"
                                    disabled={authBusy}
                                    className={`btn1 ${styles['full-btn']}`}
                                >
                                    <span>
                                        {authBusy
                                            ? 'Submitting Application...'
                                            : 'Submit Seller Registration'}
                                    </span>
                                    <span className="material-symbols-outlined">send</span>
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    if (loadingStatus) {
        return (
            <div className={styles['portal-shell']}>
                {renderPortalTopBar()}
                <Loading text="Checking Seller Approval Status"/>
            </div>
        );
    }

    // ==================== STATE 2: SIGNED IN BUT NOT YET APPROVED ====================
    if (!isApproved) {
        return (
            <div className={styles['portal-shell']}>
                {renderPortalTopBar()}

                <div className={styles['auth-stage']}>
                    <div className={styles['auth-card']}>
                        {toast && <div className={styles['toast-ok']}>{toast}</div>}
                        {error && <div className={styles['toast-err']}>{error}</div>}

                        {sellerStatus === 'PENDING' ? (
                            <div className={styles['status-screen']}>
                                <div className={`${styles['status-icon']} ${styles['icon-amber']}`}>
                                    <span className="material-symbols-outlined">hourglass_top</span>
                                </div>
                                <span className={styles['status-pill-pending']}>
                                    PENDING ADMIN APPROVAL
                                </span>
                                <h1>Your Seller Request Is Under Review</h1>
                                <p>
                                    Thank you, <strong>{currentUser?.first_name}</strong>! Your
                                    application for{' '}
                                    <strong>{sellerProfile?.store_name || 'your store'}</strong> has
                                    been sent to the FreshMart Admin team. Once an admin approves
                                    your request, you can immediately add products, view orders, and
                                    track earnings right here.
                                </p>
                                <div className={styles['status-meta-box']}>
                                    <div>
                                        <small>Store Name</small>
                                        <strong>{sellerProfile?.store_name}</strong>
                                    </div>
                                    <div>
                                        <small>Location</small>
                                        <strong>{sellerProfile?.business_location}</strong>
                                    </div>
                                    <div>
                                        <small>Applied On</small>
                                        <strong>{formatDateTime(sellerProfile?.applied_at)}</strong>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => refetchStatus()}
                                    className="btn1"
                                >
                                    <span>Refresh Approval Status</span>
                                    <span className="material-symbols-outlined">refresh</span>
                                </button>
                            </div>
                        ) : sellerStatus === 'SUSPENDED' ? (
                            <div className={styles['status-screen']}>
                                <div className={`${styles['status-icon']} ${styles['icon-rose']}`}>
                                    <span className="material-symbols-outlined">block</span>
                                </div>
                                <span className={styles['status-pill-danger']}>STORE SUSPENDED</span>
                                <h1>Seller Portal Access Suspended</h1>
                                <p>
                                    Your store <strong>{sellerProfile?.store_name}</strong> is
                                    currently suspended by an administrator.
                                    {sellerProfile?.rejection_reason
                                        ? ` Reason: ${sellerProfile.rejection_reason}`
                                        : ''}
                                </p>
                            </div>
                        ) : (
                            <>
                                <div className={styles['auth-intro']}>
                                    <span className={styles['eyebrow']}>
                                        {sellerStatus === 'REJECTED'
                                            ? 'APPLICATION NOT APPROVED — RE-APPLY'
                                            : 'APPLY AS A FRESHMART SELLER'}
                                    </span>
                                    <h1>
                                        {sellerStatus === 'REJECTED'
                                            ? 'Update & Resubmit Your Seller Request'
                                            : `Welcome, ${currentUser?.first_name || 'Partner'}! Open Your Store`}
                                    </h1>
                                    {sellerStatus === 'REJECTED' && sellerProfile?.rejection_reason && (
                                        <div className={styles['toast-err']}>
                                            Admin note: {sellerProfile.rejection_reason}
                                        </div>
                                    )}
                                    <p>
                                        Signed in as <strong>{currentUser?.email}</strong>. Complete
                                        your store details below so an Admin can approve your Seller
                                        Portal access.
                                    </p>
                                </div>

                                <form onSubmit={handleExistingUserApply} className={styles['form']}>
                                    <div className={styles['row-2']}>
                                        <div className={styles['field']}>
                                            <label>Store / Farm Name *</label>
                                            <input
                                                type="text"
                                                required
                                                value={regForm.store_name}
                                                onChange={(e) =>
                                                    setRegForm({
                                                        ...regForm,
                                                        store_name: e.target.value,
                                                    })
                                                }
                                                placeholder="e.g. Highland Fresh Produce"
                                            />
                                        </div>
                                        <div className={styles['field']}>
                                            <label>Business Phone</label>
                                            <input
                                                type="tel"
                                                value={regForm.phone}
                                                onChange={(e) =>
                                                    setRegForm({...regForm, phone: e.target.value})
                                                }
                                                placeholder={currentUser?.phone || '0712 345 678'}
                                            />
                                        </div>
                                    </div>

                                    <div className={styles['row-2']}>
                                        <div className={styles['field']}>
                                            <label>Business Location</label>
                                            <input
                                                type="text"
                                                value={regForm.business_location}
                                                onChange={(e) =>
                                                    setRegForm({
                                                        ...regForm,
                                                        business_location: e.target.value,
                                                    })
                                                }
                                                placeholder="Nairobi, Kenya"
                                            />
                                        </div>
                                        <div className={styles['field']}>
                                            <label>Primary Category</label>
                                            <select
                                                value={regForm.category_focus}
                                                onChange={(e) =>
                                                    setRegForm({
                                                        ...regForm,
                                                        category_focus: e.target.value,
                                                    })
                                                }
                                            >
                                                {CATEGORIES.map((c) => (
                                                    <option key={c} value={c}>
                                                        {c}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    <div className={styles['field']}>
                                        <label>Store Description</label>
                                        <textarea
                                            rows={3}
                                            value={regForm.business_description}
                                            onChange={(e) =>
                                                setRegForm({
                                                    ...regForm,
                                                    business_description: e.target.value,
                                                })
                                            }
                                            placeholder="Tell FreshMart admins about the products you plan to sell..."
                                        />
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={authBusy}
                                        className={`btn1 ${styles['full-btn']}`}
                                    >
                                        <span>
                                            {authBusy
                                                ? 'Submitting...'
                                                : 'Submit Seller Approval Request'}
                                        </span>
                                        <span className="material-symbols-outlined">send</span>
                                    </button>
                                </form>
                            </>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // ==================== STATE 3: APPROVED SELLER PORTAL ====================
    const kpis = overview?.kpis || {};
    const earningsTrend = overview?.earnings_trend || [];
    const topProductsChart = overview?.top_products || [];
    const sellerOrders = ordersPayload?.orders || [];

    const filteredProducts = myProducts.filter((p) => {
        if (!prodSearch.trim()) return true;
        const q = prodSearch.trim().toLowerCase();
        return (
            String(p.name || '').toLowerCase().includes(q) ||
            String(p.product_id || '').toLowerCase().includes(q) ||
            String(p.category || '').toLowerCase().includes(q)
        );
    });
    const paginatedProducts = filteredProducts.slice(
        (prodPage - 1) * prodRowsPerPage,
        prodPage * prodRowsPerPage
    );

    const filteredOrders = sellerOrders.filter((ord) => {
        if (orderFilter === 'PENDING_ADMIN') {
            if (!ord.seller_update || ord.seller_update.admin_acknowledged) return false;
        } else if (orderFilter === 'DELIVERED') {
            if (ord.customer_status !== 'DELIVERED') return false;
        } else if (orderFilter === 'RETURNED') {
            if (
                !['RETURN_IN_PROGRESS', 'RETURNED', 'REFUNDED', 'FAILED_DELIVERY'].includes(
                    ord.customer_status
                )
            )
                return false;
        } else if (orderFilter === 'ACTIVE') {
            if (
                [
                    'DELIVERED',
                    'RETURNED',
                    'REFUNDED',
                    'FAILED_DELIVERY',
                    'CANCELLED',
                    'CANCELLED_PAYMENT_UNSUCCESSFUL',
                ].includes(ord.customer_status)
            )
                return false;
        }
        if (orderSearch.trim()) {
            const q = orderSearch.trim().toLowerCase();
            return (
                String(ord.order_id || '').toLowerCase().includes(q) ||
                String(ord.customer_name || '').toLowerCase().includes(q) ||
                ord.seller_items.some((it) => String(it.name || '').toLowerCase().includes(q))
            );
        }
        return true;
    });
    const paginatedOrders = filteredOrders.slice(
        (orderPage - 1) * orderRowsPerPage,
        orderPage * orderRowsPerPage
    );

    const allReviews = reviewsPayload?.reviews || [];
    const paginatedReviews = allReviews.slice(
        (reviewPage - 1) * reviewRowsPerPage,
        reviewPage * reviewRowsPerPage
    );

    return (
        <div className={styles['portal-shell']}>
            {renderPortalTopBar()}

            <div className={styles['workspace-grid']}>
                {/* Left Seller Navigation Sidebar */}
                <aside className={styles['sidebar']}>
                    <div
                        className={styles['store-card']}
                        onClick={() => setTab('profile')}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && setTab('profile')}
                        title="Open Profile & Store Settings"
                    >
                        <div className={styles['store-badge']}>
                            {currentUser?.avatar ? (
                                <img src={currentUser.avatar} alt={sellerFullName}/>
                            ) : (
                                sellerInitials
                            )}
                        </div>
                        <div className={styles['store-info']}>
                            <strong>{sellerProfile.store_name}</strong>
                            <span className={styles['store-owner-name']}>{sellerFullName}</span>
                            <span className={styles['store-owner-email']}>{currentUser?.email}</span>
                            <small>✓ Approved Seller • {sellerProfile.business_location}</small>
                        </div>
                    </div>

                    <nav className={styles['side-nav']}>
                        {[
                            {id: 'overview', icon: 'monitoring', label: 'Earnings & Overview'},
                            {
                                id: 'products',
                                icon: 'inventory_2',
                                label: 'My Products',
                                count: kpis.total_products || myProducts.length,
                            },
                            {
                                id: 'orders',
                                icon: 'receipt_long',
                                label: 'Orders Received',
                                count: kpis.total_orders_received || 0,
                            },
                            {
                                id: 'ratings',
                                icon: 'star',
                                label: 'Ratings & Reviews',
                                count: kpis.total_reviews_count || 0,
                            },
                            {
                                id: 'notifications',
                                icon: 'notifications',
                                label: 'Notifications',
                                count: sellerUnreadNotifs,
                            },
                            {
                                id: 'profile',
                                icon: 'account_circle',
                                label: 'Profile & Store',
                            },
                        ].map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => setTab(item.id)}
                                className={`${styles['side-btn']} ${
                                    activeTab === item.id ? styles['side-btn-active'] : ''
                                }`}
                            >
                                <span className="material-symbols-outlined">{item.icon}</span>
                                <span className={styles['side-label']}>{item.label}</span>
                                {item.count > 0 && (
                                    <span className={styles['side-count']}>{item.count}</span>
                                )}
                            </button>
                        ))}
                    </nav>

                    <button
                        type="button"
                        onClick={() => {
                            setTab('products');
                            openCreateProduct();
                        }}
                        className={`btn1 ${styles['sidebar-add-btn']}`}
                    >
                        <span className="material-symbols-outlined">add_box</span>
                        <span>Add New Product</span>
                    </button>
                </aside>

                {/* Main Seller Content Area */}
                <main className={styles['main-pane']}>
                    {toast && <div className={styles['toast-ok']}>{toast}</div>}
                    {error && <div className={styles['toast-err']}>{error}</div>}

                    {/* ==================== TAB 1: OVERVIEW & EARNINGS ==================== */}
                    {activeTab === 'overview' && (
                        <>
                            <div className={styles['pane-head']}>
                                <div>
                                    <span className={styles['eyebrow']}>SELLER ANALYTICS</span>
                                    <h1>{sellerProfile.store_name} — Performance & Earnings</h1>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setTab('products');
                                        openCreateProduct();
                                    }}
                                    className="btn1"
                                >
                                    <span className="material-symbols-outlined">add</span>
                                    <span>Add Product</span>
                                </button>
                            </div>

                            {loadingOverview ? (
                                <Loading/>
                            ) : (
                                <>
                                    {sellerStockAlerts.length > 0 && (
                                        <div className={styles['seller-stock-banner']}>
                                            <div className={styles['seller-stock-left']}>
                                                <span className="material-symbols-outlined">
                                                    warning
                                                </span>
                                                <div>
                                                    <strong>
                                                        Low Stock Alert on Your Approved Products (
                                                        {sellerStockAlerts.length})
                                                    </strong>
                                                    <p>
                                                        {sellerStockAlerts
                                                            .slice(0, 3)
                                                            .map((a) => a.title)
                                                            .join(' • ')}
                                                    </p>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setTab('products')}
                                                className="btn1"
                                            >
                                                Restock Products →
                                            </button>
                                        </div>
                                    )}

                                    <div className={styles['kpi-grid']}>
                                        <div className={styles['kpi-card']}>
                                            <div className={`${styles['kpi-icon']} ${styles['k-emerald']}`}>
                                                <span className="material-symbols-outlined">payments</span>
                                            </div>
                                            <div>
                                                <small>Total Earnings</small>
                                                <strong>{formatKES(kpis.total_earnings || 0)} KES</strong>
                                                <span>
                                                    {formatKES(kpis.delivered_earnings || 0)} KES
                                                    delivered • {formatKES(kpis.pending_earnings || 0)}{' '}
                                                    pending
                                                </span>
                                            </div>
                                        </div>

                                        <div className={styles['kpi-card']}>
                                            <div className={`${styles['kpi-icon']} ${styles['k-blue']}`}>
                                                <span className="material-symbols-outlined">receipt_long</span>
                                            </div>
                                            <div>
                                                <small>Orders Received</small>
                                                <strong>{kpis.total_orders_received || 0} Orders</strong>
                                                <span>
                                                    {kpis.active_orders_count || 0} active •{' '}
                                                    {kpis.delivered_orders_count || 0} delivered
                                                </span>
                                            </div>
                                        </div>

                                        <div className={styles['kpi-card']}>
                                            <div className={`${styles['kpi-icon']} ${styles['k-purple']}`}>
                                                <span className="material-symbols-outlined">shopping_bag</span>
                                            </div>
                                            <div>
                                                <small>Products Sold</small>
                                                <strong>{kpis.total_units_sold || 0} Units</strong>
                                                <span>Across {kpis.total_products || 0} listed items</span>
                                            </div>
                                        </div>

                                        <div className={styles['kpi-card']}>
                                            <div className={`${styles['kpi-icon']} ${styles['k-rose']}`}>
                                                <span className="material-symbols-outlined">assignment_return</span>
                                            </div>
                                            <div>
                                                <small>Returned / Failed</small>
                                                <strong>{kpis.returned_units_count || 0} Units</strong>
                                                <span>
                                                    {kpis.returned_orders_count || 0} orders •{' '}
                                                    {formatKES(kpis.returned_amount || 0)} KES
                                                </span>
                                            </div>
                                        </div>

                                        <div className={styles['kpi-card']}>
                                            <div className={`${styles['kpi-icon']} ${styles['k-amber']}`}>
                                                <span className="material-symbols-outlined">star</span>
                                            </div>
                                            <div>
                                                <small>Overall Seller Rating</small>
                                                <strong>
                                                    {kpis.total_reviews_count > 0
                                                        ? `★ ${kpis.overall_seller_rating} / 5`
                                                        : 'No ratings yet'}
                                                </strong>
                                                <span>
                                                    Products: ★ {kpis.overall_product_rating || '—'} •{' '}
                                                    {kpis.total_reviews_count || 0} reviews
                                                </span>
                                            </div>
                                        </div>

                                        <div className={styles['kpi-card']}>
                                            <div className={`${styles['kpi-icon']} ${styles['k-indigo']}`}>
                                                <span className="material-symbols-outlined">inventory_2</span>
                                            </div>
                                            <div>
                                                <small>Catalog Health</small>
                                                <strong>{kpis.total_products || 0} Products</strong>
                                                <span>
                                                    {kpis.published_products ?? kpis.total_products ?? 0}{' '}
                                                    live
                                                    {(kpis.pending_approval_products || 0) > 0
                                                        ? ` • ${kpis.pending_approval_products} pending review`
                                                        : ` • ${kpis.low_stock_products || 0} low stock`}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className={styles['charts-grid']}>
                                        <div className={styles['panel']}>
                                            <h3>7-Day Earnings & Units Sold (KES)</h3>
                                            <div className={styles['chart-wrap']}>
                                                <ResponsiveContainer width="100%" height={270}>
                                                    <AreaChart data={earningsTrend}>
                                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                                                        <XAxis dataKey="day" tick={{fontSize: 12}}/>
                                                        <YAxis tick={{fontSize: 12}}/>
                                                        <Tooltip/>
                                                        <Legend/>
                                                        <Area
                                                            type="monotone"
                                                            dataKey="earnings"
                                                            name="Earnings (KES)"
                                                            stroke="#059669"
                                                            fill="#a7f3d0"
                                                            strokeWidth={2.5}
                                                        />
                                                        <Area
                                                            type="monotone"
                                                            dataKey="units"
                                                            name="Units Sold"
                                                            stroke="#3b82f6"
                                                            fill="transparent"
                                                            strokeWidth={2}
                                                        />
                                                    </AreaChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>

                                        <div className={styles['panel']}>
                                            <h3>Top Products by Earnings (KES)</h3>
                                            <div className={styles['chart-wrap']}>
                                                {topProductsChart.length === 0 ? (
                                                    <p className={styles['empty-note']}>
                                                        Add products and receive orders to see
                                                        product revenue performance.
                                                    </p>
                                                ) : (
                                                    <ResponsiveContainer width="100%" height={270}>
                                                        <BarChart data={topProductsChart.slice(0, 6)}>
                                                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                                                            <XAxis
                                                                dataKey="name"
                                                                tick={{fontSize: 11}}
                                                                tickFormatter={(v) =>
                                                                    String(v).slice(0, 12)
                                                                }
                                                            />
                                                            <YAxis tick={{fontSize: 12}}/>
                                                            <Tooltip/>
                                                            <Legend/>
                                                            <Bar
                                                                dataKey="earnings"
                                                                name="Earnings (KES)"
                                                                fill="#10b981"
                                                                radius={[6, 6, 0, 0]}
                                                            />
                                                            <Bar
                                                                dataKey="units_sold"
                                                                name="Sold Units"
                                                                fill="#6366f1"
                                                                radius={[6, 6, 0, 0]}
                                                            />
                                                        </BarChart>
                                                    </ResponsiveContainer>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}
                        </>
                    )}

                    {/* ==================== TAB 2: MY PRODUCTS (ADD & EDIT) ==================== */}
                    {activeTab === 'products' && (
                        <>
                            <div className={styles['pane-head']}>
                                <div>
                                    <span className={styles['eyebrow']}>SELLER CATALOG</span>
                                    <h1>My Products ({myProducts.length})</h1>
                                </div>
                                <button
                                    type="button"
                                    onClick={() =>
                                        showProductForm ? setShowProductForm(false) : openCreateProduct()
                                    }
                                    className="btn1"
                                >
                                    <span className="material-symbols-outlined">
                                        {showProductForm ? 'close' : 'add'}
                                    </span>
                                    <span>
                                        {showProductForm ? 'Close Form' : 'Add New Product'}
                                    </span>
                                </button>
                            </div>

                            {showProductForm && (
                                <SellerProductWizard
                                    editingProduct={editingProduct}
                                    sellerProfile={sellerProfile}
                                    onSaved={handleProductWizardSaved}
                                    onCancel={() => {
                                        setShowProductForm(false);
                                        setEditingProduct(null);
                                    }}
                                />
                            )}

                            {myProducts.some((p) => p.approval_status === 'PENDING_APPROVAL') && (
                                <div className={styles['staging-info-banner']}>
                                    <span className="material-symbols-outlined">hourglass_top</span>
                                    <div>
                                        <strong>
                                            Products Awaiting Admin Approval Before Publishing:
                                        </strong>{' '}
                                        {
                                            myProducts.filter(
                                                (p) => p.approval_status === 'PENDING_APPROVAL'
                                            ).length
                                        }{' '}
                                        product(s) are currently being reviewed by an Admin. They
                                        are hidden from shoppers until approved and published live.
                                    </div>
                                </div>
                            )}

                            {myProducts.some((p) => Boolean(p.pending_changes)) && (
                                <div className={styles['staging-info-banner']}>
                                    <span className="material-symbols-outlined">edit_note</span>
                                    <div>
                                        <strong>
                                            Published Product Edits Awaiting Admin Approval:
                                        </strong>{' '}
                                        {
                                            myProducts.filter((p) => Boolean(p.pending_changes))
                                                .length
                                        }{' '}
                                        published product(s) have edited details under Admin review.
                                        Shoppers continue seeing the previous published details
                                        until Admin approves the changes.
                                    </div>
                                </div>
                            )}

                            <div className={styles['panel']}>
                                <div className={styles['toolbar']}>
                                    <input
                                        type="text"
                                        value={prodSearch}
                                        onChange={(e) => setProdSearch(e.target.value)}
                                        placeholder="Search your products by name, ID, or category..."
                                        className={styles['search-input']}
                                    />
                                </div>

                                {loadingProducts ? (
                                    <Loading/>
                                ) : filteredProducts.length === 0 ? (
                                    <p className={styles['empty-note']}>
                                        No products in your catalog yet. Click &ldquo;Add New
                                        Product&rdquo; above to list your first item!
                                    </p>
                                ) : (
                                    <>
                                        <div className={styles['table-wrap']}>
                                            <table className={styles['table']}>
                                                <thead>
                                                    <tr>
                                                        <th>Product</th>
                                                        <th>Publishing Status</th>
                                                        <th>Price</th>
                                                        <th>Stock</th>
                                                        <th>Sold</th>
                                                        <th>Returned</th>
                                                        <th>Earnings</th>
                                                        <th>Rating</th>
                                                        <th>Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {paginatedProducts.map((p) => {
                                                        const pubStatus =
                                                            p.approval_status || 'APPROVED';
                                                        const isPendingPub =
                                                            pubStatus === 'PENDING_APPROVAL';
                                                        const isRejectedPub =
                                                            pubStatus === 'REJECTED';
                                                        return (
                                                            <tr key={p.product_id}>
                                                                <td>
                                                                    <div className={styles['prod-cell']}>
                                                                        <img
                                                                            src={p.image}
                                                                            alt={p.name}
                                                                        />
                                                                        <div>
                                                                            <strong>{p.name}</strong>
                                                                            <small>
                                                                                #{p.product_id} •{' '}
                                                                                {p.category}
                                                                            </small>
                                                                        </div>
                                                                    </div>
                                                                </td>
                                                                <td>
                                                                    <div
                                                                        style={{
                                                                            display: 'flex',
                                                                            flexDirection: 'column',
                                                                            alignItems: 'flex-start',
                                                                            gap: '0.2rem',
                                                                        }}
                                                                    >
                                                                        <span
                                                                            className={`${styles['stock-pill']} ${
                                                                                isPendingPub
                                                                                    ? styles['st-amber']
                                                                                    : isRejectedPub
                                                                                    ? styles['st-red']
                                                                                    : styles['st-green']
                                                                            }`}
                                                                        >
                                                                            {isPendingPub
                                                                                ? '⏳ Pending Publishing'
                                                                                : isRejectedPub
                                                                                ? '✕ Not Approved'
                                                                                : '✓ Published Live'}
                                                                        </span>
                                                                        {isPendingPub && (
                                                                            <small
                                                                                style={{
                                                                                    fontSize: '0.7rem',
                                                                                    color: '#b45309',
                                                                                }}
                                                                            >
                                                                                Being reviewed by
                                                                                Admin
                                                                            </small>
                                                                        )}
                                                                        {isRejectedPub && (
                                                                            <small
                                                                                style={{
                                                                                    fontSize: '0.7rem',
                                                                                    color: '#b91c1c',
                                                                                    maxWidth: '180px',
                                                                                }}
                                                                            >
                                                                                {p.rejection_reason
                                                                                    ? `${p.rejection_reason} — Edit to resubmit`
                                                                                    : 'Edit details to resubmit for review'}
                                                                            </small>
                                                                        )}
                                                                        {p.pending_changes && (
                                                                            <div
                                                                                className={
                                                                                    styles[
                                                                                        'pending-edits-box'
                                                                                    ]
                                                                                }
                                                                            >
                                                                                <strong>
                                                                                    ✏️ Edits Pending
                                                                                    Admin Approval
                                                                                </strong>
                                                                                {(
                                                                                    p.pending_changes
                                                                                        .diff_summary ||
                                                                                    []
                                                                                )
                                                                                    .slice(0, 3)
                                                                                    .map((d, i) => (
                                                                                        <small
                                                                                            key={i}
                                                                                        >
                                                                                            {d.field}
                                                                                            :{' '}
                                                                                            {d.from}{' '}
                                                                                            → {d.to}
                                                                                        </small>
                                                                                    ))}
                                                                            </div>
                                                                        )}
                                                                        {!p.pending_changes &&
                                                                            p.pending_changes_note && (
                                                                                <small
                                                                                    style={{
                                                                                        fontSize:
                                                                                            '0.7rem',
                                                                                        color: '#b91c1c',
                                                                                        maxWidth:
                                                                                            '190px',
                                                                                    }}
                                                                                >
                                                                                    Last edit note:{' '}
                                                                                    {
                                                                                        p.pending_changes_note
                                                                                    }
                                                                                </small>
                                                                            )}
                                                                    </div>
                                                                </td>
                                                            <td>
                                                                <strong>
                                                                    {formatKES(p.discounted_price)} KES
                                                                </strong>
                                                                {Number(p.discount || 0) > 0 && (
                                                                    <small className={styles['disc-sub']}>
                                                                        -{p.discount}% off{' '}
                                                                        {formatKES(p.price)}
                                                                    </small>
                                                                )}
                                                            </td>
                                                            <td>
                                                                <span
                                                                    className={`${styles['stock-pill']} ${
                                                                        p.stock <= 0
                                                                            ? styles['st-red']
                                                                            : p.stock <= 10
                                                                            ? styles['st-amber']
                                                                            : styles['st-green']
                                                                    }`}
                                                                >
                                                                    {p.stock} left
                                                                </span>
                                                            </td>
                                                            <td>
                                                                <strong>{p.units_sold || 0}</strong>
                                                            </td>
                                                            <td>{p.returned_units || 0}</td>
                                                            <td>
                                                                <strong className={styles['earn-txt']}>
                                                                    {formatKES(p.earnings || 0)} KES
                                                                </strong>
                                                            </td>
                                                            <td>
                                                                ★{' '}
                                                                {p.reviews_count > 0
                                                                    ? `${p.rating} (${p.reviews_count})`
                                                                    : 'New'}
                                                            </td>
                                                            <td>
                                                                <div className={styles['act-row']}>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() =>
                                                                            openEditProduct(p)
                                                                        }
                                                                        className={styles['edit-btn']}
                                                                    >
                                                                        Edit
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() =>
                                                                            handleDeleteProduct(p)
                                                                        }
                                                                        className={styles['del-btn']}
                                                                    >
                                                                        Delete
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>

                                        <TablePagination
                                            totalItems={filteredProducts.length}
                                            currentPage={prodPage}
                                            rowsPerPage={prodRowsPerPage}
                                            onPageChange={setProdPage}
                                            onRowsPerPageChange={setProdRowsPerPage}
                                            itemLabel="products"
                                        />
                                    </>
                                )}
                            </div>
                        </>
                    )}

                    {/* ==================== TAB 3: INCOMING ORDERS & ADMIN-STAGED UPDATES ==================== */}
                    {activeTab === 'orders' && (
                        <>
                            <div className={styles['pane-head']}>
                                <div>
                                    <span className={styles['eyebrow']}>SELLER FULFILLMENT</span>
                                    <h1>Orders Received ({sellerOrders.length})</h1>
                                </div>
                            </div>

                            <div className={styles['staging-info-banner']}>
                                <span className="material-symbols-outlined">shield_person</span>
                                <div>
                                    <strong>Admin-Verified Order Status Workflow:</strong> When you
                                    submit a dispatch update below (e.g., <em>Shipped</em> or{' '}
                                    <em>Waiting to be Shipped</em>), it notifies the FreshMart Admin
                                    team without changing what the customer sees yet. The customer
                                    sees the updated status once Admin confirms and applies it.
                                </div>
                            </div>

                            <div className={styles['panel']}>
                                <div className={styles['toolbar']}>
                                    <input
                                        type="text"
                                        value={orderSearch}
                                        onChange={(e) => setOrderSearch(e.target.value)}
                                        placeholder="Search by Order ID, customer name, or product..."
                                        className={styles['search-input']}
                                    />
                                    <div className={styles['filter-pills']}>
                                        {[
                                            {id: 'ALL', label: `All (${sellerOrders.length})`},
                                            {id: 'ACTIVE', label: 'Active'},
                                            {id: 'PENDING_ADMIN', label: 'Awaiting Admin Sync'},
                                            {id: 'DELIVERED', label: 'Delivered'},
                                            {id: 'RETURNED', label: 'Returned / Failed'},
                                        ].map((f) => (
                                            <button
                                                key={f.id}
                                                type="button"
                                                onClick={() => setOrderFilter(f.id)}
                                                className={`${styles['f-pill']} ${
                                                    orderFilter === f.id ? styles['f-pill-active'] : ''
                                                }`}
                                            >
                                                {f.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {loadingOrders ? (
                                    <Loading/>
                                ) : filteredOrders.length === 0 ? (
                                    <p className={styles['empty-note']}>
                                        No matching customer orders containing your products yet.
                                    </p>
                                ) : (
                                    <>
                                        <div className={styles['orders-stack']}>
                                            {paginatedOrders.map((ord) => {
                                                const custMeta = getStatusMeta(ord.customer_status);
                                                const draft = getOrderDraft(ord);
                                                const propMeta = ord.seller_update
                                                    ? getStatusMeta(ord.seller_update.proposed_status)
                                                    : null;

                                                return (
                                                    <article
                                                        key={ord.order_id}
                                                        className={styles['order-card']}
                                                    >
                                                        <div className={styles['order-top']}>
                                                            <div className={styles['order-id-group']}>
                                                                <span className={styles['ord-id']}>
                                                                    #{ord.order_id}
                                                                </span>
                                                                <span>
                                                                    {formatDateTime(ord.ordered_at)}
                                                                </span>
                                                                <span>• {ord.customer_name}</span>
                                                                <span>
                                                                    •{' '}
                                                                    {ord.delivery_method ===
                                                                    'PICKUP_STATION'
                                                                        ? '🏪 Pickup'
                                                                        : '🛵 Doorstep'}{' '}
                                                                    ({ord.destination_city})
                                                                </span>
                                                            </div>
                                                            <div className={styles['order-top-right']}>
                                                                <span className={styles['cust-st-pill']}>
                                                                    Customer Sees: {custMeta.label}
                                                                </span>
                                                                <strong className={styles['earn-txt']}>
                                                                    +{formatKES(ord.seller_order_earnings)}{' '}
                                                                    KES
                                                                </strong>
                                                            </div>
                                                        </div>

                                                        <div className={styles['order-items-list']}>
                                                            {ord.seller_items.map((it) => (
                                                                <div
                                                                    key={it.product_id}
                                                                    className={styles['ord-item-row']}
                                                                >
                                                                    <img src={it.image} alt={it.name}/>
                                                                    <div>
                                                                        <strong>{it.name}</strong>
                                                                        <small>
                                                                            {it.quantity} ×{' '}
                                                                            {formatKES(it.unit_price)}{' '}
                                                                            KES
                                                                        </small>
                                                                    </div>
                                                                    <strong>
                                                                        {formatKES(it.line_total)} KES
                                                                    </strong>
                                                                </div>
                                                            ))}
                                                        </div>

                                                        {ord.seller_update && (
                                                            <div
                                                                className={`${styles['proposal-state']} ${
                                                                    ord.seller_update.admin_acknowledged
                                                                        ? styles['prop-applied']
                                                                        : styles['prop-pending']
                                                                }`}
                                                            >
                                                                <strong>
                                                                    {ord.seller_update
                                                                        .admin_acknowledged
                                                                        ? `✓ Admin applied your "${propMeta?.label}" update`
                                                                        : `⏳ Sent "${propMeta?.label}" to Admin — Pending Admin confirmation`}
                                                                </strong>
                                                                {ord.seller_update.note && (
                                                                    <span>
                                                                        Note: &ldquo;
                                                                        {ord.seller_update.note}&rdquo;
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}

                                                        <div className={styles['propose-row']}>
                                                            <select
                                                                value={draft.status}
                                                                onChange={(e) =>
                                                                    updateOrderDraft(
                                                                        ord.order_id,
                                                                        'status',
                                                                        e.target.value,
                                                                        ord
                                                                    )
                                                                }
                                                            >
                                                                {SELLER_PROPOSABLE_STATUSES.map(
                                                                    (st) => (
                                                                        <option key={st} value={st}>
                                                                            {getStatusMeta(st).label}
                                                                        </option>
                                                                    )
                                                                )}
                                                            </select>
                                                            <input
                                                                type="text"
                                                                value={draft.note}
                                                                onChange={(e) =>
                                                                    updateOrderDraft(
                                                                        ord.order_id,
                                                                        'note',
                                                                        e.target.value,
                                                                        ord
                                                                    )
                                                                }
                                                                placeholder="Dispatch note for Admin (e.g. Packed & handed to rider)..."
                                                            />
                                                            <button
                                                                type="button"
                                                                disabled={
                                                                    updatingOrderId === ord.order_id
                                                                }
                                                                onClick={() =>
                                                                    handleProposeOrderStatus(ord)
                                                                }
                                                                className={styles['send-admin-btn']}
                                                            >
                                                                {updatingOrderId === ord.order_id
                                                                    ? 'Sending...'
                                                                    : 'Send Status Update to Admin'}
                                                            </button>
                                                        </div>
                                                    </article>
                                                );
                                            })}
                                        </div>

                                        <TablePagination
                                            totalItems={filteredOrders.length}
                                            currentPage={orderPage}
                                            rowsPerPage={orderRowsPerPage}
                                            onPageChange={setOrderPage}
                                            onRowsPerPageChange={setOrderRowsPerPage}
                                            itemLabel="orders"
                                        />
                                    </>
                                )}
                            </div>
                        </>
                    )}

                    {/* ==================== TAB 4: RATINGS & REVIEWS ==================== */}
                    {activeTab === 'ratings' && (
                        <>
                            <div className={styles['pane-head']}>
                                <div>
                                    <span className={styles['eyebrow']}>CUSTOMER FEEDBACK</span>
                                    <h1>Store & Product Ratings</h1>
                                </div>
                            </div>

                            {loadingReviews ? (
                                <Loading/>
                            ) : (
                                <>
                                    <div className={styles['ratings-top-grid']}>
                                        <div className={styles['panel']}>
                                            <h3>Overall Store Score</h3>
                                            <div className={styles['big-score']}>
                                                <strong>
                                                    {reviewsPayload?.overall_seller_rating || '0.0'}
                                                </strong>
                                                <div>
                                                    <span className={styles['stars-gold']}>
                                                        {'★'.repeat(
                                                            Math.round(
                                                                Number(
                                                                    reviewsPayload?.overall_seller_rating ||
                                                                        0
                                                                )
                                                            )
                                                        )}
                                                    </span>
                                                    <small>
                                                        Seller Rating •{' '}
                                                        {reviewsPayload?.total_reviews_count || 0}{' '}
                                                        verified reviews
                                                    </small>
                                                    <small>
                                                        Avg Product Quality: ★{' '}
                                                        {reviewsPayload?.overall_product_rating ||
                                                            '0.0'}{' '}
                                                        / 5
                                                    </small>
                                                </div>
                                            </div>
                                        </div>

                                        <div className={styles['panel']}>
                                            <h3>Star Distribution</h3>
                                            <div className={styles['bars-stack']}>
                                                {(reviewsPayload?.star_distribution || []).map(
                                                    (row) => (
                                                        <div
                                                            key={row.star}
                                                            className={styles['bar-row']}
                                                        >
                                                            <span>{row.star} ★</span>
                                                            <div className={styles['bar-track']}>
                                                                <div
                                                                    className={styles['bar-fill']}
                                                                    style={{width: `${row.pct}%`}}
                                                                />
                                                            </div>
                                                            <small>{row.count}</small>
                                                        </div>
                                                    )
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className={styles['panel']}>
                                        <h3>Ratings by Product</h3>
                                        {(reviewsPayload?.per_product_ratings || []).length === 0 ? (
                                            <p className={styles['empty-note']}>
                                                No products listed yet.
                                            </p>
                                        ) : (
                                            <div className={styles['table-wrap']}>
                                                <table className={styles['table']}>
                                                    <thead>
                                                        <tr>
                                                            <th>Product</th>
                                                            <th>Product Rating</th>
                                                            <th>Seller Rating</th>
                                                            <th>Total Reviews</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {(
                                                            reviewsPayload?.per_product_ratings ||
                                                            []
                                                        ).map((p) => (
                                                            <tr key={p.product_id}>
                                                                <td>
                                                                    <div className={styles['prod-cell']}>
                                                                        <img src={p.image} alt={p.name}/>
                                                                        <div>
                                                                            <strong>{p.name}</strong>
                                                                            <small>{p.category}</small>
                                                                        </div>
                                                                    </div>
                                                                </td>
                                                                <td>
                                                                    <strong>
                                                                        ★ {p.product_rating || '—'}
                                                                    </strong>
                                                                </td>
                                                                <td>
                                                                    <strong>
                                                                        ★ {p.seller_rating || '—'}
                                                                    </strong>
                                                                </td>
                                                                <td>{p.reviews_count}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>

                                    <div className={styles['panel']}>
                                        <h3>All Verified Customer Reviews ({allReviews.length})</h3>
                                        {allReviews.length === 0 ? (
                                            <p className={styles['empty-note']}>
                                                No verified buyer reviews on your products yet.
                                            </p>
                                        ) : (
                                            <>
                                                <div className={styles['reviews-stack']}>
                                                    {paginatedReviews.map((rev, idx) => (
                                                        <div
                                                            key={rev._id || idx}
                                                            className={styles['rev-card']}
                                                        >
                                                            <div className={styles['rev-top']}>
                                                                <div className={styles['prod-cell']}>
                                                                    <img
                                                                        src={rev.product_image}
                                                                        alt={rev.product_name}
                                                                    />
                                                                    <div>
                                                                        <strong>
                                                                            {rev.product_name}
                                                                        </strong>
                                                                        <small>
                                                                            By {rev.user_name}
                                                                            {rev.order_id
                                                                                ? ` • Order #${rev.order_id}`
                                                                                : ''}
                                                                        </small>
                                                                    </div>
                                                                </div>
                                                                <small>
                                                                    {formatDateTime(rev.created_at)}
                                                                </small>
                                                            </div>
                                                            <div className={styles['rev-scores']}>
                                                                <span>
                                                                    Product:{' '}
                                                                    <strong>
                                                                        {'★'.repeat(rev.product_rating)}
                                                                    </strong>{' '}
                                                                    ({rev.product_rating}/5)
                                                                </span>
                                                                <span>•</span>
                                                                <span>
                                                                    Seller:{' '}
                                                                    <strong>
                                                                        {'★'.repeat(rev.seller_rating)}
                                                                    </strong>{' '}
                                                                    ({rev.seller_rating}/5)
                                                                </span>
                                                            </div>
                                                            {rev.comment && (
                                                                <p className={styles['rev-text']}>
                                                                    &ldquo;{rev.comment}&rdquo;
                                                                </p>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                                <TablePagination
                                                    totalItems={allReviews.length}
                                                    currentPage={reviewPage}
                                                    rowsPerPage={reviewRowsPerPage}
                                                    onPageChange={setReviewPage}
                                                    onRowsPerPageChange={setReviewRowsPerPage}
                                                    itemLabel="reviews"
                                                />
                                            </>
                                        )}
                                    </div>
                                </>
                            )}
                        </>
                    )}

                    {/* ==================== TAB 5B: SELLER NOTIFICATIONS ==================== */}
                    {activeTab === 'notifications' && (() => {
                        const filteredSellerNotifs = sellerNotifications.filter((n) => {
                            if (notifFilter === 'UNREAD' && n.read) return false;
                            if (
                                notifFilter === 'STOCK' &&
                                n.type !== 'SELLER_LOW_STOCK' &&
                                n.type !== 'SELLER_OUT_OF_STOCK'
                            )
                                return false;
                            if (notifFilter === 'ORDERS' && n.type !== 'ORDER_CONFIRMED')
                                return false;
                            if (
                                notifFilter === 'APPROVALS' &&
                                n.type !== 'PRODUCT_APPROVAL_RESULT' &&
                                n.type !== 'SELLER_APPROVAL'
                            )
                                return false;
                            if (notifSearch.trim()) {
                                const q = notifSearch.trim().toLowerCase();
                                return (
                                    String(n.title || '').toLowerCase().includes(q) ||
                                    String(n.message || '').toLowerCase().includes(q) ||
                                    String(n.order_id || '').toLowerCase().includes(q)
                                );
                            }
                            return true;
                        });
                        const pagedSellerNotifs = filteredSellerNotifs.slice(
                            (notifPage - 1) * notifRowsPerPage,
                            notifPage * notifRowsPerPage
                        );

                        return (
                            <>
                                <div className={styles['pane-head']}>
                                    <div>
                                        <span className={styles['eyebrow']}>STORE ALERTS</span>
                                        <h1>
                                            Seller Notifications ({sellerNotifications.length})
                                        </h1>
                                    </div>
                                    {sellerUnreadNotifs > 0 && (
                                        <button
                                            type="button"
                                            onClick={handleMarkAllSellerNotifsRead}
                                            className="btn1"
                                        >
                                            <span className="material-symbols-outlined">done_all</span>
                                            <span>Mark All Read ({sellerUnreadNotifs})</span>
                                        </button>
                                    )}
                                </div>

                                <div className={styles['staging-info-banner']}>
                                    <span className="material-symbols-outlined">inventory_2</span>
                                    <div>
                                        <strong>Seller-Specific Alerts:</strong> Low-stock and
                                        out-of-stock alerts here track <b>only your own approved</b>{' '}
                                        products (≤ 10 units). You also receive instant alerts when
                                        customers buy your products or when Admin approves/reviews
                                        your listings and edits.
                                    </div>
                                </div>

                                <div className={styles['panel']}>
                                    <div className={styles['toolbar']}>
                                        <input
                                            type="text"
                                            value={notifSearch}
                                            onChange={(e) => setNotifSearch(e.target.value)}
                                            placeholder="Search store notifications by product, order ID, or message..."
                                            className={styles['search-input']}
                                        />
                                        <div className={styles['filter-pills']}>
                                            {[
                                                {
                                                    id: 'ALL',
                                                    label: `All (${sellerNotifications.length})`,
                                                },
                                                {
                                                    id: 'UNREAD',
                                                    label: `Unread (${sellerUnreadNotifs})`,
                                                },
                                                {
                                                    id: 'STOCK',
                                                    label: `Low Stock (${sellerStockAlerts.length})`,
                                                },
                                                {id: 'ORDERS', label: 'Orders'},
                                                {id: 'APPROVALS', label: 'Approvals'},
                                            ].map((f) => (
                                                <button
                                                    key={f.id}
                                                    type="button"
                                                    onClick={() => setNotifFilter(f.id)}
                                                    className={`${styles['f-pill']} ${
                                                        notifFilter === f.id
                                                            ? styles['f-pill-active']
                                                            : ''
                                                    }`}
                                                >
                                                    {f.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {loadingSellerNotifs ? (
                                        <Loading/>
                                    ) : filteredSellerNotifs.length === 0 ? (
                                        <p className={styles['empty-note']}>
                                            No matching store notifications right now.
                                        </p>
                                    ) : (
                                        <>
                                            <div className={styles['seller-notif-feed']}>
                                                {pagedSellerNotifs.map((n) => (
                                                    <div
                                                        key={n._id}
                                                        onClick={() =>
                                                            handleOpenSellerNotification(n)
                                                        }
                                                        className={`${styles['seller-notif-card']} ${
                                                            !n.read
                                                                ? styles['seller-notif-card-unread']
                                                                : ''
                                                        }`}
                                                    >
                                                        <div className={styles['seller-notif-icon']}>
                                                            {getSellerNotifIcon(n.type)}
                                                        </div>
                                                        <div className={styles['seller-notif-body']}>
                                                            <div
                                                                style={{
                                                                    display: 'flex',
                                                                    justifyContent: 'space-between',
                                                                    gap: '0.5rem',
                                                                    flexWrap: 'wrap',
                                                                }}
                                                            >
                                                                <strong>{n.title}</strong>
                                                                <small>
                                                                    {formatDateTime(n.created_at)}
                                                                </small>
                                                            </div>
                                                            <p>{n.message}</p>
                                                        </div>
                                                        {!n.read && (
                                                            <span
                                                                className={
                                                                    styles['seller-unread-dot']
                                                                }
                                                            />
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                            <TablePagination
                                                totalItems={filteredSellerNotifs.length}
                                                currentPage={notifPage}
                                                rowsPerPage={notifRowsPerPage}
                                                onPageChange={setNotifPage}
                                                onRowsPerPageChange={setNotifRowsPerPage}
                                                itemLabel="notifications"
                                            />
                                        </>
                                    )}
                                </div>
                            </>
                        );
                    })()}

                    {/* ==================== TAB 5: PROFILE & STORE SETTINGS ==================== */}
                    {activeTab === 'profile' && (
                        <>
                            <div className={styles['pane-head']}>
                                <div>
                                    <span className={styles['eyebrow']}>SELLER IDENTITY & STORE</span>
                                    <h1>My Profile & Store Details</h1>
                                </div>
                            </div>

                            {/* Seller Identity Hero Banner */}
                            <div className={styles['profile-hero-card']}>
                                <div className={styles['profile-avatar-block']}>
                                    <div className={styles['profile-avatar-lg']}>
                                        {profileForm.avatar || currentUser?.avatar ? (
                                            <img
                                                src={profileForm.avatar || currentUser?.avatar}
                                                alt={sellerFullName}
                                            />
                                        ) : (
                                            sellerInitials
                                        )}
                                    </div>
                                    <div className={styles['avatar-actions']}>
                                        <input
                                            ref={avatarInputRef}
                                            type="file"
                                            accept="image/*"
                                            onChange={handleAvatarUpload}
                                            style={{display: 'none'}}
                                        />
                                        <button
                                            type="button"
                                            disabled={uploadingAvatar}
                                            onClick={() => avatarInputRef.current?.click()}
                                            className={styles['edit-btn']}
                                        >
                                            {uploadingAvatar ? 'Uploading...' : 'Change Photo'}
                                        </button>
                                        {(profileForm.avatar || currentUser?.avatar) && (
                                            <button
                                                type="button"
                                                disabled={uploadingAvatar}
                                                onClick={handleRemoveAvatar}
                                                className={styles['del-btn']}
                                            >
                                                Remove
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className={styles['profile-hero-info']}>
                                    <div className={styles['profile-badges-row']}>
                                        <span className={styles['verified-pill']}>
                                            ✓ Approved Seller
                                        </span>
                                        <span className={styles['role-pill']}>
                                            Role: {currentUser?.role || 'SELLER'}
                                        </span>
                                        {sellerProfile?.category_focus && (
                                            <span className={styles['cat-chip']}>
                                                {sellerProfile.category_focus}
                                            </span>
                                        )}
                                    </div>
                                    <h2>{sellerFullName}</h2>
                                    <p className={styles['profile-store-line']}>
                                        🏪 <strong>{sellerProfile?.store_name}</strong> • 📍{' '}
                                        {sellerProfile?.business_location || 'Nairobi, Kenya'}
                                    </p>
                                    <div className={styles['profile-contact-strip']}>
                                        <span>✉️ {currentUser?.email}</span>
                                        {(currentUser?.phone || sellerProfile?.business_phone) && (
                                            <span>
                                                📞{' '}
                                                {sellerProfile?.business_phone ||
                                                    currentUser?.phone}
                                            </span>
                                        )}
                                        {sellerProfile?.reviewed_at && (
                                            <span>
                                                🗓️ Approved:{' '}
                                                {formatDateTime(sellerProfile.reviewed_at)}
                                            </span>
                                        )}
                                    </div>
                                    {currentUser?.bio && (
                                        <p className={styles['profile-bio-preview']}>
                                            {currentUser.bio}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Edit Personal & Store Details + Password Security */}
                            <div className={styles['profile-grid']}>
                                <div className={styles['panel']}>
                                    <h3>Edit Personal & Store Profile</h3>
                                    <form
                                        onSubmit={handleSaveSellerProfile}
                                        className={styles['form']}
                                    >
                                        <span className={styles['section-divider']}>
                                            Personal Account Details
                                        </span>
                                        <div className={styles['row-2']}>
                                            <div className={styles['field']}>
                                                <label>First Name *</label>
                                                <input
                                                    type="text"
                                                    required
                                                    value={profileForm.first_name}
                                                    onChange={(e) =>
                                                        setProfileForm({
                                                            ...profileForm,
                                                            first_name: e.target.value,
                                                        })
                                                    }
                                                />
                                            </div>
                                            <div className={styles['field']}>
                                                <label>Last Name</label>
                                                <input
                                                    type="text"
                                                    value={profileForm.last_name}
                                                    onChange={(e) =>
                                                        setProfileForm({
                                                            ...profileForm,
                                                            last_name: e.target.value,
                                                        })
                                                    }
                                                />
                                            </div>
                                        </div>

                                        <div className={styles['row-2']}>
                                            <div className={styles['field']}>
                                                <label>Email Address (Read-Only)</label>
                                                <input
                                                    type="email"
                                                    value={currentUser?.email || ''}
                                                    disabled
                                                    style={{background: '#f1f5f9', color: '#64748b'}}
                                                />
                                            </div>
                                            <div className={styles['field']}>
                                                <label>Personal Phone Number</label>
                                                <input
                                                    type="tel"
                                                    value={profileForm.phone}
                                                    onChange={(e) =>
                                                        setProfileForm({
                                                            ...profileForm,
                                                            phone: e.target.value,
                                                        })
                                                    }
                                                    placeholder="0712 345 678"
                                                />
                                            </div>
                                        </div>

                                        <div className={styles['field']}>
                                            <label>Owner Bio</label>
                                            <textarea
                                                rows={2}
                                                value={profileForm.bio}
                                                onChange={(e) =>
                                                    setProfileForm({
                                                        ...profileForm,
                                                        bio: e.target.value,
                                                    })
                                                }
                                                placeholder="Short note about yourself as the store owner..."
                                            />
                                        </div>

                                        <span className={styles['section-divider']}>
                                            Store / Business Profile (Shown on Your Products)
                                        </span>
                                        <div className={styles['row-2']}>
                                            <div className={styles['field']}>
                                                <label>Store / Farm Name *</label>
                                                <input
                                                    type="text"
                                                    required
                                                    value={profileForm.store_name}
                                                    onChange={(e) =>
                                                        setProfileForm({
                                                            ...profileForm,
                                                            store_name: e.target.value,
                                                        })
                                                    }
                                                />
                                            </div>
                                            <div className={styles['field']}>
                                                <label>Business Phone</label>
                                                <input
                                                    type="tel"
                                                    value={profileForm.business_phone}
                                                    onChange={(e) =>
                                                        setProfileForm({
                                                            ...profileForm,
                                                            business_phone: e.target.value,
                                                        })
                                                    }
                                                />
                                            </div>
                                        </div>

                                        <div className={styles['row-2']}>
                                            <div className={styles['field']}>
                                                <label>Business Location</label>
                                                <input
                                                    type="text"
                                                    value={profileForm.business_location}
                                                    onChange={(e) =>
                                                        setProfileForm({
                                                            ...profileForm,
                                                            business_location: e.target.value,
                                                        })
                                                    }
                                                />
                                            </div>
                                            <div className={styles['field']}>
                                                <label>Primary Category Focus</label>
                                                <select
                                                    value={profileForm.category_focus}
                                                    onChange={(e) =>
                                                        setProfileForm({
                                                            ...profileForm,
                                                            category_focus: e.target.value,
                                                        })
                                                    }
                                                >
                                                    {CATEGORIES.map((c) => (
                                                        <option key={c} value={c}>
                                                            {c}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        <div className={styles['field']}>
                                            <label>Store Description</label>
                                            <textarea
                                                rows={3}
                                                value={profileForm.business_description}
                                                onChange={(e) =>
                                                    setProfileForm({
                                                        ...profileForm,
                                                        business_description: e.target.value,
                                                    })
                                                }
                                                placeholder="Describe your farm, sourcing standards, or specialty products..."
                                            />
                                        </div>

                                        <button
                                            type="submit"
                                            disabled={savingProfile}
                                            className="btn1"
                                            style={{alignSelf: 'flex-start'}}
                                        >
                                            <span>
                                                {savingProfile
                                                    ? 'Saving Profile...'
                                                    : 'Save Profile & Store Details'}
                                            </span>
                                            <span className="material-symbols-outlined">save</span>
                                        </button>
                                    </form>
                                </div>

                                <div className={styles['profile-side-col']}>
                                    <div className={styles['panel']}>
                                        <h3>Approval & Store Metadata</h3>
                                        <div className={styles['meta-list']}>
                                            <div className={styles['meta-row']}>
                                                <span>Portal Status</span>
                                                <strong style={{color: '#059669'}}>
                                                    ✓ {sellerStatus}
                                                </strong>
                                            </div>
                                            <div className={styles['meta-row']}>
                                                <span>Applied On</span>
                                                <strong>
                                                    {formatDateTime(sellerProfile?.applied_at)}
                                                </strong>
                                            </div>
                                            {sellerProfile?.reviewed_at && (
                                                <div className={styles['meta-row']}>
                                                    <span>Approved On</span>
                                                    <strong>
                                                        {formatDateTime(sellerProfile.reviewed_at)}
                                                    </strong>
                                                </div>
                                            )}
                                            {sellerProfile?.reviewed_by && (
                                                <div className={styles['meta-row']}>
                                                    <span>Approved By</span>
                                                    <strong>{sellerProfile.reviewed_by}</strong>
                                                </div>
                                            )}
                                            <div className={styles['meta-row']}>
                                                <span>Listed Products</span>
                                                <strong>
                                                    {kpis.total_products || myProducts.length}
                                                </strong>
                                            </div>
                                            <div className={styles['meta-row']}>
                                                <span>Orders Received</span>
                                                <strong>{kpis.total_orders_received || 0}</strong>
                                            </div>
                                        </div>
                                    </div>

                                    <div className={styles['panel']}>
                                        <h3>Account Security (Password)</h3>
                                        <form
                                            onSubmit={handleChangeSellerPassword}
                                            className={styles['form']}
                                        >
                                            <div className={styles['field']}>
                                                <label>Current Password *</label>
                                                <input
                                                    type="password"
                                                    required
                                                    value={pwForm.currentPassword}
                                                    onChange={(e) =>
                                                        setPwForm({
                                                            ...pwForm,
                                                            currentPassword: e.target.value,
                                                        })
                                                    }
                                                />
                                            </div>
                                            <div className={styles['field']}>
                                                <label>New Password (min 8 chars) *</label>
                                                <input
                                                    type="password"
                                                    required
                                                    minLength={8}
                                                    value={pwForm.newPassword}
                                                    onChange={(e) =>
                                                        setPwForm({
                                                            ...pwForm,
                                                            newPassword: e.target.value,
                                                        })
                                                    }
                                                />
                                            </div>
                                            <div className={styles['field']}>
                                                <label>Confirm New Password *</label>
                                                <input
                                                    type="password"
                                                    required
                                                    minLength={8}
                                                    value={pwForm.confirmPassword}
                                                    onChange={(e) =>
                                                        setPwForm({
                                                            ...pwForm,
                                                            confirmPassword: e.target.value,
                                                        })
                                                    }
                                                />
                                            </div>
                                            <button
                                                type="submit"
                                                disabled={savingPassword}
                                                className={`btn1 ${styles['full-btn']}`}
                                            >
                                                <span>
                                                    {savingPassword
                                                        ? 'Updating...'
                                                        : 'Update Password'}
                                                </span>
                                                <span className="material-symbols-outlined">
                                                    lock_reset
                                                </span>
                                            </button>
                                        </form>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </main>
            </div>
        </div>
    );
};

export default SellerPortal;
