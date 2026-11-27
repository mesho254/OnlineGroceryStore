import styles from './profile.module.css';
import {useContext, useEffect, useRef, useState} from "react";
import {Link, useLocation, useNavigate} from "react-router-dom";
import {useDispatch, useSelector} from "react-redux";
import {useQuery} from "@tanstack/react-query";
import {logout} from "../../actions/auth";
import {UPDATE_PROFILE} from "../../constants/actions/authentication";
import * as api from "../../api";
import {queryClient} from "../../index";
import {CartContext} from "../../App";
import Loading from "../../components/loading/Loading";
import PendingReviewsSection from "../pending-reviews/PendingReviewsSection";
import ConfirmActionModal from "../confirm-modal/ConfirmActionModal";
import {formatKES} from "../../utils/pricing";

/**
 * Resize and center-crop an uploaded image file into a crisp 320x320 square JPEG data URL
 * so it uploads fast, stores cleanly in MongoDB, and renders sharply in the Navbar & Profile.
 */
const resizeImageFileToDataUrl = (file, size = 320, quality = 0.86) =>
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

const formatOrderDate = (val) => {
    if (!val) return 'Recent';
    const d = new Date(val);
    if (isNaN(d.getTime())) return 'Recent';
    return d.toLocaleDateString('en-KE', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
};

const Profile = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const dispatch = useDispatch();
    const fileInputRef = useRef(null);
    const user = useSelector((state) => state.authentication.user);
    const {cartCount = 0} = useContext(CartContext);

    const resolveTabFromUrl = () => {
        const t = new URLSearchParams(location.search).get('tab');
        if (t === 'reviews') return 'REVIEWS';
        if (t === 'password') return 'PASSWORD';
        return 'DETAILS';
    };

    const [activeTab, setActiveTab] = useState(resolveTabFromUrl); // 'DETAILS' | 'REVIEWS' | 'PASSWORD'
    const [savingProfile, setSavingProfile] = useState(false);

    useEffect(() => {
        setActiveTab(resolveTabFromUrl());
    }, [location.search]);

    const switchProfileTab = (tabName) => {
        setActiveTab(tabName);
        if (tabName === 'REVIEWS') navigate('/profile?tab=reviews', {replace: true});
        else if (tabName === 'PASSWORD') navigate('/profile?tab=password', {replace: true});
        else navigate('/profile', {replace: true});
    };
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [savingPassword, setSavingPassword] = useState(false);
    const [feedback, setFeedback] = useState('');
    const [error, setError] = useState('');

    // Profile Form State
    const [firstName, setFirstName] = useState(user?.first_name || '');
    const [lastName, setLastName] = useState(user?.last_name || '');
    const [phone, setPhone] = useState(user?.phone || '');
    const [bio, setBio] = useState(user?.bio || '');
    const [avatarUrlInput, setAvatarUrlInput] = useState('');
    const [city, setCity] = useState(user?.address?.city || 'Nairobi');
    const [area, setArea] = useState(user?.address?.area || '');
    const [street, setStreet] = useState(user?.address?.street || '');
    const [buildingNumber, setBuildingNumber] = useState(user?.address?.building_number || '');
    const [floor, setFloor] = useState(user?.address?.floor || '');
    const [apartmentNumber, setApartmentNumber] = useState(user?.address?.apartment_number || '');

    // Password Change State
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    // Account Suspension (GDPR Trash) Modal State
    const [suspendModalOpen, setSuspendModalOpen] = useState(false);
    const [suspendingAccount, setSuspendingAccount] = useState(false);
    const [suspendError, setSuspendError] = useState('');

    const {data: profileData, isPending} = useQuery({
        queryKey: ['userProfile'],
        queryFn: async () => {
            const res = await api.fetchUserProfile();
            return res.data;
        },
        staleTime: 0,
        refetchOnMount: 'always',
    });

    const {data: pendingReviewsData} = useQuery({
        queryKey: ['pendingReviews'],
        queryFn: async () => {
            const res = await api.fetchPendingReviews();
            return res.data;
        },
        staleTime: 0,
        refetchOnMount: 'always',
    });
    const pendingReviewsCount = pendingReviewsData?.pending_count || 0;

    useEffect(() => {
        const srvUser = profileData?.user;
        if (!srvUser) return;
        dispatch({type: UPDATE_PROFILE, data: srvUser});
        setFirstName(srvUser.first_name || '');
        setLastName(srvUser.last_name || '');
        setPhone(srvUser.phone || '');
        setBio(srvUser.bio || '');
        setCity(srvUser.address?.city || 'Nairobi');
        setArea(srvUser.address?.area || '');
        setStreet(srvUser.address?.street || '');
        setBuildingNumber(srvUser.address?.building_number || '');
        setFloor(srvUser.address?.floor || '');
        setApartmentNumber(srvUser.address?.apartment_number || '');
    }, [profileData, dispatch]);

    const showSuccess = (msg) => {
        setFeedback(msg);
        setError('');
        setTimeout(() => setFeedback(''), 4500);
    };

    const handleAvatarFileSelected = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            return setError('Please choose a valid image file (PNG, JPG, WebP).');
        }

        setUploadingAvatar(true);
        setError('');
        try {
            const dataUrl = await resizeImageFileToDataUrl(file, 320, 0.86);
            const res = await api.updateUserProfile({avatar: dataUrl});
            if (res.data?.user) {
                dispatch({type: UPDATE_PROFILE, data: res.data.user});
                queryClient.invalidateQueries({queryKey: ['userProfile']});
                showSuccess('✓ Profile picture updated! It is now live on your navbar.');
            }
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Failed to upload profile image.');
        } finally {
            setUploadingAvatar(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleApplyAvatarUrl = async () => {
        const trimmed = avatarUrlInput.trim();
        if (!trimmed) return;
        setUploadingAvatar(true);
        setError('');
        try {
            const res = await api.updateUserProfile({avatar: trimmed});
            if (res.data?.user) {
                dispatch({type: UPDATE_PROFILE, data: res.data.user});
                queryClient.invalidateQueries({queryKey: ['userProfile']});
                setAvatarUrlInput('');
                showSuccess('✓ Profile image URL applied and updated on navbar.');
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to save profile image URL.');
        } finally {
            setUploadingAvatar(false);
        }
    };

    const handleRemoveAvatar = async () => {
        setUploadingAvatar(true);
        setError('');
        try {
            const res = await api.updateUserProfile({avatar: ''});
            if (res.data?.user) {
                dispatch({type: UPDATE_PROFILE, data: res.data.user});
                queryClient.invalidateQueries({queryKey: ['userProfile']});
                showSuccess('✓ Profile photo removed. Showing default initials badge.');
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to remove profile image.');
        } finally {
            setUploadingAvatar(false);
        }
    };

    const handleSaveProfile = async (e) => {
        e.preventDefault();
        if (!firstName.trim()) {
            return setError('First name is required.');
        }
        setSavingProfile(true);
        setError('');
        try {
            const res = await api.updateUserProfile({
                first_name: firstName.trim(),
                last_name: lastName.trim(),
                phone: phone.trim(),
                bio: bio.trim(),
                address: {
                    city: city.trim() || 'Nairobi',
                    area: area.trim(),
                    street: street.trim(),
                    building_number: buildingNumber.trim(),
                    floor: floor.trim(),
                    apartment_number: apartmentNumber.trim(),
                },
            });
            if (res.data?.user) {
                dispatch({type: UPDATE_PROFILE, data: res.data.user});
                queryClient.invalidateQueries({queryKey: ['userProfile']});
                showSuccess('✓ Profile details and default delivery address saved!');
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to update profile.');
        } finally {
            setSavingProfile(false);
        }
    };

    const handleChangePassword = async (e) => {
        e.preventDefault();
        if (!currentPassword || !newPassword) {
            return setError('Please enter your current password and a new password.');
        }
        if (newPassword.length < 8) {
            return setError('New password must be at least 8 characters long.');
        }
        if (newPassword !== confirmPassword) {
            return setError('New password and confirmation do not match.');
        }

        setSavingPassword(true);
        setError('');
        try {
            const res = await api.changeUserPassword({
                current_password: currentPassword,
                new_password: newPassword,
            });
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            showSuccess(`✓ ${res.data?.message || 'Password updated successfully.'}`);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to update password.');
        } finally {
            setSavingPassword(false);
        }
    };

    const handleLogout = () => {
        dispatch(logout);
        navigate('/login');
    };

    const handleConfirmSelfSuspend = async ({reason, password}) => {
        if (suspendingAccount) return;
        setSuspendingAccount(true);
        setSuspendError('');
        try {
            const res = await api.suspendMyAccount({password, reason});
            setSuspendModalOpen(false);
            dispatch(logout);
            navigate('/login', {
                replace: true,
                state: {
                    message:
                        res.data?.message ||
                        'Your account has been suspended and archived under GDPR retention. Contact an administrator to restore it.',
                },
            });
        } catch (err) {
            setSuspendError(
                err.response?.data?.message || 'Could not suspend your account. Please try again.'
            );
        } finally {
            setSuspendingAccount(false);
        }
    };

    if (isPending && !user) return <Loading/>;

    const currentUser = profileData?.user || user || {};
    const stats = profileData?.stats || {
        orders_count: 0,
        delivered_count: 0,
        active_orders_count: 0,
        total_spent: 0,
        wishlist_count: currentUser.wishlist?.length || 0,
        cart_count: cartCount,
    };
    const recentOrders = profileData?.recent_orders || [];

    const fullName =
        [currentUser.first_name, currentUser.last_name].filter(Boolean).join(' ') ||
        'FreshMart Customer';
    const initials = (currentUser.first_name || currentUser.email || 'U')
        .charAt(0)
        .toUpperCase();
    const isAdmin = currentUser.role === 'ADMIN';

    const savedAddressSummary = [
        currentUser.address?.street,
        currentUser.address?.area,
        currentUser.address?.city,
    ]
        .filter(Boolean)
        .join(', ');

    return (
        <div className={styles['wrapper']}>
            {feedback && <div className={styles['toast-ok']}>{feedback}</div>}
            {error && <div className={styles['toast-err']}>{error}</div>}

            {/* Top Hero Profile Banner with Avatar Uploader */}
            <section className={styles['hero-card']}>
                <div className={styles['hero-main']}>
                    {/* Interactive Profile Photo Block */}
                    <div className={styles['avatar-stage']}>
                        <div
                            className={styles['avatar-frame']}
                            onClick={() => fileInputRef.current?.click()}
                            title="Click to upload a new profile photo"
                        >
                            {currentUser.avatar ? (
                                <img
                                    src={currentUser.avatar}
                                    alt={fullName}
                                    className={styles['avatar-photo']}
                                />
                            ) : (
                                <span className={styles['avatar-initial']}>{initials}</span>
                            )}
                            <div className={styles['avatar-overlay']}>
                                <span className="material-symbols-outlined">photo_camera</span>
                                <small>{uploadingAvatar ? 'Saving...' : 'Change'}</small>
                            </div>
                        </div>

                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleAvatarFileSelected}
                            hidden
                        />

                        <div className={styles['avatar-btns']}>
                            <button
                                type="button"
                                disabled={uploadingAvatar}
                                onClick={() => fileInputRef.current?.click()}
                                className={styles['upload-pill']}
                            >
                                <span className="material-symbols-outlined">upload</span>
                                <span>{uploadingAvatar ? 'Uploading...' : 'Upload Photo'}</span>
                            </button>
                            {currentUser.avatar && (
                                <button
                                    type="button"
                                    disabled={uploadingAvatar}
                                    onClick={handleRemoveAvatar}
                                    className={styles['remove-pill']}
                                >
                                    Remove
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Customer Identity & Contact Summary */}
                    <div className={styles['identity-col']}>
                        <div className={styles['badges-row']}>
                            <span
                                className={
                                    isAdmin ? styles['badge-admin'] : styles['badge-customer']
                                }
                            >
                                <span className="material-symbols-outlined">
                                    {isAdmin ? 'shield_person' : 'verified_user'}
                                </span>
                                {isAdmin ? 'Store Administrator' : 'Verified Customer'}
                            </span>
                            {savedAddressSummary && (
                                <span className={styles['badge-location']}>
                                    <span className="material-symbols-outlined">location_on</span>
                                    {savedAddressSummary}
                                </span>
                            )}
                        </div>

                        <h1>{fullName}</h1>

                        <div className={styles['contact-strip']}>
                            <span>
                                <span className="material-symbols-outlined">mail</span>
                                {currentUser.email}
                            </span>
                            <span>
                                <span className="material-symbols-outlined">call</span>
                                {currentUser.phone || 'No phone added yet'}
                            </span>
                        </div>

                        {currentUser.bio && <p className={styles['bio-text']}>{currentUser.bio}</p>}
                    </div>

                    {/* Right Quick Actions */}
                    <div className={styles['hero-actions']}>
                        {isAdmin && (
                            <Link to="/admin" className={styles['admin-btn']}>
                                <span className="material-symbols-outlined">monitoring</span>
                                <span>Admin Console</span>
                            </Link>
                        )}
                        <Link to="/shipping" className={styles['orders-btn']}>
                            <span className="material-symbols-outlined">local_shipping</span>
                            <span>Track Orders</span>
                        </Link>
                        <button
                            type="button"
                            onClick={handleLogout}
                            className={styles['logout-btn']}
                        >
                            <span className="material-symbols-outlined">logout</span>
                            <span>Sign Out</span>
                        </button>
                    </div>
                </div>

                {/* 4 Live Account Metric Cards */}
                <div className={styles['stats-grid']}>
                    <Link to="/shipping" className={styles['stat-card']}>
                        <div className={`${styles['stat-icon']} ${styles['icon-emerald']}`}>
                            <span className="material-symbols-outlined">receipt_long</span>
                        </div>
                        <div>
                            <small>Orders Placed</small>
                            <strong>{stats.orders_count || 0}</strong>
                            <span>
                                {stats.delivered_count || 0} delivered •{' '}
                                {stats.active_orders_count || 0} active
                            </span>
                        </div>
                    </Link>

                    <div className={styles['stat-card']}>
                        <div className={`${styles['stat-icon']} ${styles['icon-blue']}`}>
                            <span className="material-symbols-outlined">payments</span>
                        </div>
                        <div>
                            <small>Lifetime Spend</small>
                            <strong>{formatKES(stats.total_spent || 0)} KES</strong>
                            <span>Across confirmed orders</span>
                        </div>
                    </div>

                    <Link to="/wishlist" className={styles['stat-card']}>
                        <div className={`${styles['stat-icon']} ${styles['icon-rose']}`}>
                            <span className="material-symbols-outlined">favorite</span>
                        </div>
                        <div>
                            <small>Saved Wishlist</small>
                            <strong>{currentUser.wishlist?.length ?? stats.wishlist_count ?? 0}</strong>
                            <span>Favorite grocery items</span>
                        </div>
                    </Link>

                    <Link to="/cart" className={styles['stat-card']}>
                        <div className={`${styles['stat-icon']} ${styles['icon-amber']}`}>
                            <span className="material-symbols-outlined">shopping_bag</span>
                        </div>
                        <div>
                            <small>Active Basket</small>
                            <strong>{cartCount || stats.cart_count || 0}</strong>
                            <span>Items ready for checkout</span>
                        </div>
                    </Link>

                    <button
                        type="button"
                        onClick={() => switchProfileTab('REVIEWS')}
                        className={`${styles['stat-card']} ${styles['stat-btn']}`}
                    >
                        <div className={`${styles['stat-icon']} ${styles['icon-gold']}`}>
                            <span className="material-symbols-outlined">rate_review</span>
                        </div>
                        <div>
                            <small>Pending Reviews</small>
                            <strong>{pendingReviewsCount}</strong>
                            <span>
                                {pendingReviewsCount > 0
                                    ? 'Delivered items to rate'
                                    : 'All deliveries rated'}
                            </span>
                        </div>
                    </button>
                </div>
            </section>

            {/* Two-Column Body: Settings / Reviews + Recent Orders */}
            <div className={styles['body-grid']}>
                {/* Left Column: Edit Profile / Pending Reviews / Change Password */}
                <section className={styles['card']}>
                    <div className={styles['tabs-bar']}>
                        <button
                            type="button"
                            onClick={() => switchProfileTab('DETAILS')}
                            className={`${styles['tab-btn']} ${
                                activeTab === 'DETAILS' ? styles['tab-active'] : ''
                            }`}
                        >
                            <span className="material-symbols-outlined">manage_accounts</span>
                            <span>Edit Profile & Address</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => switchProfileTab('REVIEWS')}
                            className={`${styles['tab-btn']} ${
                                activeTab === 'REVIEWS' ? styles['tab-active'] : ''
                            }`}
                        >
                            <span className="material-symbols-outlined">rate_review</span>
                            <span>Pending Reviews</span>
                            {pendingReviewsCount > 0 && (
                                <span className={styles['tab-badge']}>{pendingReviewsCount}</span>
                            )}
                        </button>

                        <button
                            type="button"
                            onClick={() => switchProfileTab('PASSWORD')}
                            className={`${styles['tab-btn']} ${
                                activeTab === 'PASSWORD' ? styles['tab-active'] : ''
                            }`}
                        >
                            <span className="material-symbols-outlined">lock_reset</span>
                            <span>Security & Password</span>
                        </button>
                    </div>

                    {activeTab === 'REVIEWS' ? (
                        <PendingReviewsSection embedded={true}/>
                    ) : activeTab === 'DETAILS' ? (
                        <form onSubmit={handleSaveProfile} className={styles['form']}>
                            {/* Avatar Upload / URL Bar inside form too */}
                            <div className={styles['photo-url-box']}>
                                <label>Profile Image (Upload File or Paste Image URL)</label>
                                <div className={styles['url-row']}>
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        className={styles['choose-file-btn']}
                                    >
                                        <span className="material-symbols-outlined">
                                            add_a_photo
                                        </span>
                                        <span>Choose Image from Computer</span>
                                    </button>
                                    <input
                                        type="url"
                                        value={avatarUrlInput}
                                        onChange={(e) => setAvatarUrlInput(e.target.value)}
                                        placeholder="Or paste image URL (https://...)"
                                    />
                                    {avatarUrlInput.trim() && (
                                        <button
                                            type="button"
                                            onClick={handleApplyAvatarUrl}
                                            className={styles['apply-url-btn']}
                                        >
                                            Apply URL
                                        </button>
                                    )}
                                </div>
                            </div>

                            <h3 className={styles['sec-title']}>Personal Contact Information</h3>
                            <div className={styles['row-2']}>
                                <div className={styles['field']}>
                                    <label>First Name *</label>
                                    <input
                                        type="text"
                                        value={firstName}
                                        onChange={(e) => setFirstName(e.target.value)}
                                        placeholder="First Name"
                                        required
                                    />
                                </div>
                                <div className={styles['field']}>
                                    <label>Last Name</label>
                                    <input
                                        type="text"
                                        value={lastName}
                                        onChange={(e) => setLastName(e.target.value)}
                                        placeholder="Last Name"
                                    />
                                </div>
                            </div>

                            <div className={styles['row-2']}>
                                <div className={styles['field']}>
                                    <label>Email Address (Account ID)</label>
                                    <input
                                        type="email"
                                        value={currentUser.email || ''}
                                        disabled
                                        className={styles['disabled-input']}
                                    />
                                </div>
                                <div className={styles['field']}>
                                    <label>Phone Number (For Delivery Updates)</label>
                                    <input
                                        type="tel"
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value)}
                                        placeholder="e.g. 0712 345 678"
                                    />
                                </div>
                            </div>

                            <div className={styles['field']}>
                                <label>Bio / Delivery Note (Optional)</label>
                                <input
                                    type="text"
                                    value={bio}
                                    onChange={(e) => setBio(e.target.value)}
                                    placeholder="e.g. Call at main gate upon arrival"
                                />
                            </div>

                            <h3 className={styles['sec-title']}>Default Delivery Address</h3>
                            <div className={styles['row-2']}>
                                <div className={styles['field']}>
                                    <label>City / Town</label>
                                    <input
                                        type="text"
                                        value={city}
                                        onChange={(e) => setCity(e.target.value)}
                                        placeholder="Nairobi"
                                    />
                                </div>
                                <div className={styles['field']}>
                                    <label>Area / Estate / Neighborhood</label>
                                    <input
                                        type="text"
                                        value={area}
                                        onChange={(e) => setArea(e.target.value)}
                                        placeholder="e.g. Westlands, Kilimani"
                                    />
                                </div>
                            </div>

                            <div className={styles['field']}>
                                <label>Street / Road / Landmark</label>
                                <input
                                    type="text"
                                    value={street}
                                    onChange={(e) => setStreet(e.target.value)}
                                    placeholder="e.g. Karuna Road, Near Sarit Centre"
                                />
                            </div>

                            <div className={styles['row-3']}>
                                <div className={styles['field']}>
                                    <label>Building / Court</label>
                                    <input
                                        type="text"
                                        value={buildingNumber}
                                        onChange={(e) => setBuildingNumber(e.target.value)}
                                        placeholder="Building Name"
                                    />
                                </div>
                                <div className={styles['field']}>
                                    <label>Floor</label>
                                    <input
                                        type="text"
                                        value={floor}
                                        onChange={(e) => setFloor(e.target.value)}
                                        placeholder="e.g. 2nd Floor"
                                    />
                                </div>
                                <div className={styles['field']}>
                                    <label>House / Apt No.</label>
                                    <input
                                        type="text"
                                        value={apartmentNumber}
                                        onChange={(e) => setApartmentNumber(e.target.value)}
                                        placeholder="e.g. Apt B4"
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={savingProfile}
                                className={`btn1 ${styles['save-btn']}`}
                            >
                                <span>
                                    {savingProfile
                                        ? 'Saving Profile Changes...'
                                        : 'Save Profile & Delivery Address'}
                                </span>
                                <span className="material-symbols-outlined">check_circle</span>
                            </button>
                        </form>
                    ) : (
                        <form onSubmit={handleChangePassword} className={styles['form']}>
                            <h3 className={styles['sec-title']}>Update Account Password</h3>
                            <p className={styles['sec-note']}>
                                Choose a strong password with at least 8 characters. Forgot your current password?{' '}
                                <Link to="/forgot-password" className={styles['inline-link']}>
                                    Send a password reset link to your email →
                                </Link>
                            </p>

                            <div className={styles['field']}>
                                <label>Current Password *</label>
                                <input
                                    type="password"
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    placeholder="Enter your current password"
                                    required
                                />
                            </div>

                            <div className={styles['row-2']}>
                                <div className={styles['field']}>
                                    <label>New Password (Min 8 characters) *</label>
                                    <input
                                        type="password"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        placeholder="At least 8 characters"
                                        required
                                    />
                                </div>
                                <div className={styles['field']}>
                                    <label>Confirm New Password *</label>
                                    <input
                                        type="password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        placeholder="Repeat new password"
                                        required
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={savingPassword}
                                className={`btn1 ${styles['save-btn']}`}
                            >
                                <span>
                                    {savingPassword ? 'Updating Password...' : 'Update Password'}
                                </span>
                                <span className="material-symbols-outlined">lock</span>
                            </button>

                            {/* GDPR Account Suspension Danger Zone */}
                            <div className={styles['danger-zone']}>
                                <div className={styles['danger-head']}>
                                    <span className="material-symbols-outlined">gpp_maybe</span>
                                    <div>
                                        <h4>Suspend Account &amp; GDPR Data Privacy</h4>
                                        <p>
                                            Need to deactivate your FreshMart account? Suspending
                                            immediately signs you out and moves your profile to
                                            GDPR-compliant archival Trash for{' '}
                                            <strong>365 days</strong> (statutory order &amp; tax
                                            retention). You can contact an administrator anytime
                                            during this window to restore your account before
                                            automated erasure.
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSuspendError('');
                                        setSuspendModalOpen(true);
                                    }}
                                    className={styles['suspend-account-btn']}
                                >
                                    <span className="material-symbols-outlined">person_off</span>
                                    <span>Suspend My Account</span>
                                </button>
                            </div>
                        </form>
                    )}
                </section>

                {/* Right Column: Recent Orders & Quick Account Links */}
                <aside className={styles['card']}>
                    <div className={styles['side-head']}>
                        <h3>Recent Orders ({recentOrders.length})</h3>
                        <Link to="/shipping">View All →</Link>
                    </div>

                    {recentOrders.length === 0 ? (
                        <div className={styles['empty-orders']}>
                            <span className="material-symbols-outlined">shopping_basket</span>
                            <h4>No orders placed yet</h4>
                            <p>
                                Explore our farm-fresh aisles and enjoy 20-minute express doorstep or pickup hub delivery!
                            </p>
                            <Link to="/products" className="btn1">
                                <span>Start Shopping</span>
                                <span className="material-symbols-outlined">storefront</span>
                            </Link>
                        </div>
                    ) : (
                        <div className={styles['orders-list']}>
                            {recentOrders.map((ord) => (
                                <div key={ord.order_id} className={styles['order-item']}>
                                    <div className={styles['order-left']}>
                                        <div className={styles['order-top-line']}>
                                            <Link
                                                to={`/orders/${ord.order_id}`}
                                                className={styles['order-id']}
                                            >
                                                #{ord.order_id}
                                            </Link>
                                            <span className={styles['order-date']}>
                                                {formatOrderDate(ord.ordered_at)}
                                            </span>
                                        </div>
                                        <small>
                                            {ord.items_count}{' '}
                                            {ord.items_count === 1 ? 'item' : 'items'} •{' '}
                                            {ord.delivery_method === 'PICKUP_STATION'
                                                ? 'Pickup Hub'
                                                : 'Doorstep'}
                                        </small>
                                    </div>

                                    <div className={styles['order-right']}>
                                        <strong>{formatKES(ord.total)} KES</strong>
                                        <div className={styles['order-links']}>
                                            <Link to={`/orders/${ord.order_id}`}>Receipt</Link>
                                            <span>•</span>
                                            <Link to={`/shipping/${ord.order_id}`}>Track →</Link>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </aside>
            </div>

            <ConfirmActionModal
                isOpen={suspendModalOpen}
                onClose={() => !suspendingAccount && setSuspendModalOpen(false)}
                onConfirm={handleConfirmSelfSuspend}
                variant="danger"
                icon="person_off"
                title="Suspend Your Account?"
                subtitle={currentUser.email}
                description="Your account will be deactivated immediately and archived in GDPR Trash. You will be signed out right away."
                policyTitle="GDPR Extended Retention & Restoration Policy (365 Days)"
                policyPoints={[
                    'Under GDPR Art. 17(3)(b) statutory accounting and dispute rules, your profile is safely archived for 365 days before automated personal data erasure.',
                    'You will not be able to sign in while suspended, and any Seller Portal listings/access will be paused.',
                    'Changed your mind? Contact an Administrator anytime within 365 days to restore your account with one click.',
                ]}
                showReasonInput={true}
                reasonLabel="Reason for suspending account (optional)"
                reasonPlaceholder="Tell us why you are taking a break or suspending your account..."
                requirePassword={true}
                passwordLabel="Enter your current password to confirm *"
                confirmLabel="Yes, Suspend My Account"
                loading={suspendingAccount}
                error={suspendError}
            />
        </div>
    );
};

export default Profile;
