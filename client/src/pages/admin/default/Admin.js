import styles from './admin.module.css';
import {useEffect, useState} from "react";
import {Link, useLocation, useNavigate} from "react-router-dom";
import {useQuery} from "@tanstack/react-query";
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    BarChart,
    Bar,
    PieChart,
    Pie,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
} from "recharts";
import AdminLayout from "../../../components/admin-layout/AdminLayout";
import TablePagination from "../../../components/table-pagination/TablePagination";
import Loading from "../../../components/loading/Loading";
import AdminProductViewModal from "../../../components/admin-product-modal/AdminProductViewModal";
import ConfirmActionModal from "../../../components/confirm-modal/ConfirmActionModal";
import IconActionButton from "../../../components/icon-action-btn/IconActionButton";
import * as api from "../../../api";
import {queryClient} from "../../../index";
import {formatKES} from "../../../utils/pricing";
import {getStatusMeta} from "../../../utils/orderStatuses";

const PIE_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444'];

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

const Admin = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const searchParams = new URLSearchParams(location.search);
    const activeTab = searchParams.get('tab') || 'overview';
    const urlStockFilter = searchParams.get('stock');

    const [feedback, setFeedback] = useState('');
    const [error, setError] = useState('');
    const [runningStockCron, setRunningStockCron] = useState(false);

    // Inventory tab filters, pagination & edit state
    const [invSearch, setInvSearch] = useState('');
    const [invCategory, setInvCategory] = useState('ALL');
    const [invStockFilter, setInvStockFilter] = useState(
        urlStockFilter &&
            ['LOW', 'OUT', 'FLASH', 'PENDING_APPROVAL', 'PENDING_EDITS', 'REJECTED'].includes(
                urlStockFilter
            )
            ? urlStockFilter
            : 'ALL'
    );

    useEffect(() => {
        if (
            urlStockFilter &&
            [
                'LOW',
                'OUT',
                'FLASH',
                'PENDING_APPROVAL',
                'PENDING_EDITS',
                'REJECTED',
                'ALL',
            ].includes(urlStockFilter)
        ) {
            setInvStockFilter(urlStockFilter);
            setInvPage(1);
        }
    }, [urlStockFilter]);
    const [invPage, setInvPage] = useState(1);
    const [invRowsPerPage, setInvRowsPerPage] = useState(5);
    const [editingProduct, setEditingProduct] = useState(null);
    const [savingProductId, setSavingProductId] = useState(null);
    const [viewingProduct, setViewingProduct] = useState(null);

    // Confirmation Modal State (for Product Trash, User Suspend, Permanent Erase)
    const [confirmConfig, setConfirmConfig] = useState(null);
    const [confirmBusy, setConfirmBusy] = useState(false);
    const [confirmError, setConfirmError] = useState('');

    // Trash & GDPR Retention tab state
    const [trashSubTab, setTrashSubTab] = useState('products'); // 'products' | 'users'
    const [trashSearch, setTrashSearch] = useState('');
    const [trashPage, setTrashPage] = useState(1);
    const [trashRowsPerPage, setTrashRowsPerPage] = useState(5);
    const [restoringKey, setRestoringKey] = useState(null);
    const [runningTrashCron, setRunningTrashCron] = useState(false);

    // Sellers tab filters & pagination
    const [sellerSearch, setSellerSearch] = useState('');
    const [sellerStatusFilter, setSellerStatusFilter] = useState('ALL');
    const [sellerPage, setSellerPage] = useState(1);
    const [sellerRowsPerPage, setSellerRowsPerPage] = useState(5);
    const [updatingSellerId, setUpdatingSellerId] = useState(null);

    // Users tab filters & pagination
    const [userSearch, setUserSearch] = useState('');
    const [userRoleFilter, setUserRoleFilter] = useState('ALL');
    const [userPage, setUserPage] = useState(1);
    const [userRowsPerPage, setUserRowsPerPage] = useState(5);
    const [updatingUserId, setUpdatingUserId] = useState(null);

    // Audit Logs tab filters, pagination & manual note form
    const [logCategory, setLogCategory] = useState('ALL');
    const [logSeverity, setLogSeverity] = useState('ALL');
    const [logPage, setLogPage] = useState(1);
    const [logRowsPerPage, setLogRowsPerPage] = useState(5);
    const [noteDetails, setNoteDetails] = useState('');
    const [noteCategory, setNoteCategory] = useState('SYSTEM');
    const [noteSeverity, setNoteSeverity] = useState('INFO');

    const {data: overview, isPending: loadingOverview} = useQuery({
        queryKey: ['adminOverview'],
        queryFn: async () => {
            const res = await api.fetchAdminOverview();
            return res.data;
        },
        staleTime: 0,
        refetchOnMount: 'always',
    });

    const {data: inventory = [], isPending: loadingInventory} = useQuery({
        queryKey: ['adminInventory'],
        queryFn: async () => {
            const res = await api.fetchAdminInventory();
            return Array.isArray(res.data) ? res.data : [];
        },
        enabled: activeTab === 'inventory' || activeTab === 'overview',
        staleTime: 0,
        refetchOnMount: 'always',
    });

    const {data: sellers = [], isPending: loadingSellers} = useQuery({
        queryKey: ['adminSellers'],
        queryFn: async () => {
            const res = await api.fetchAdminSellers();
            return Array.isArray(res.data) ? res.data : [];
        },
        enabled: activeTab === 'sellers',
        staleTime: 0,
        refetchOnMount: 'always',
    });

    const {data: users = [], isPending: loadingUsers} = useQuery({
        queryKey: ['adminUsers'],
        queryFn: async () => {
            const res = await api.fetchAdminUsers();
            return Array.isArray(res.data) ? res.data : [];
        },
        enabled: activeTab === 'users',
        staleTime: 0,
        refetchOnMount: 'always',
    });

    const {data: logs = [], isPending: loadingLogs} = useQuery({
        queryKey: ['adminLogs', logCategory, logSeverity],
        queryFn: async () => {
            const res = await api.fetchAdminLogs(logCategory, logSeverity);
            return Array.isArray(res.data) ? res.data : [];
        },
        enabled: activeTab === 'logs',
        staleTime: 0,
        refetchOnMount: 'always',
    });

    const {data: trashData, isPending: loadingTrash} = useQuery({
        queryKey: ['adminTrash'],
        queryFn: async () => {
            const res = await api.fetchAdminTrash();
            return res.data;
        },
        enabled: activeTab === 'trash',
        staleTime: 0,
        refetchOnMount: 'always',
    });

    const setTab = (tabName) => {
        setFeedback('');
        setError('');
        if (tabName === 'overview') {
            navigate('/admin');
        } else {
            navigate(`/admin?tab=${tabName}`);
        }
    };

    const showToast = (msg) => {
        setFeedback(msg);
        setTimeout(() => setFeedback(''), 4000);
    };

    const handleRunStockCronNow = async () => {
        if (runningStockCron) return;
        setRunningStockCron(true);
        setError('');
        try {
            const res = await api.triggerAdminStockCronScan();
            const d = res.data || {};
            queryClient.invalidateQueries({queryKey: ['adminOverview']});
            queryClient.invalidateQueries({queryKey: ['notifications']});
            queryClient.invalidateQueries({queryKey: ['adminLogs']});
            showToast(
                `✓ Stock monitor scan complete: ${d.out_of_stock_count || 0} sold out, ${
                    d.low_stock_count || 0
                } low stock. Notifications synced.`
            );
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to run inventory stock check.');
        } finally {
            setRunningStockCron(false);
        }
    };

    // Inventory quick edit handlers
    const startEditProduct = (prod) => {
        setEditingProduct({
            product_id: prod.product_id,
            price: prod.price,
            stock: prod.stock,
            discount: prod.discount || 0,
            flash_sale: Boolean(prod.flash_sale),
        });
    };

    const handleSaveProductQuick = async (productId) => {
        if (!editingProduct) return;
        setSavingProductId(productId);
        setError('');
        try {
            await api.updateAdminProductQuick(productId, {
                price: Number(editingProduct.price),
                stock: Number(editingProduct.stock),
                discount: Number(editingProduct.discount),
                flash_sale: Boolean(editingProduct.flash_sale),
            });
            setEditingProduct(null);
            queryClient.invalidateQueries({queryKey: ['adminInventory']});
            queryClient.invalidateQueries({queryKey: ['adminOverview']});
            queryClient.invalidateQueries({queryKey: ['products']});
            queryClient.invalidateQueries({queryKey: ['notifications']});
            showToast(`✓ Updated product #${productId} inventory & pricing.`);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to update product.');
        } finally {
            setSavingProductId(null);
        }
    };

    const openTrashProductConfirm = (prod) => {
        setConfirmError('');
        setConfirmConfig({
            kind: 'TRASH_PRODUCT',
            target: prod,
            variant: 'warning',
            icon: 'delete_outline',
            title: `Move "${prod.name}" to Trash?`,
            subtitle: `Product #${prod.sku || prod.product_id} • ${prod.category || 'Catalog'}`,
            description:
                'This product will be hidden immediately from the storefront, search, recommendations, and active inventory, and moved safely to the Admin Trash bin.',
            policyTitle: '30-Day Trash Retention Policy',
            policyPoints: [
                'Stays recoverable in Admin → Trash & GDPR for 30 days.',
                'You can restore it back to live inventory with one click anytime within 30 days.',
                'After 30 days, expired trashed items are automatically and permanently deleted.',
            ],
            showReasonInput: true,
            reasonLabel: 'Reason for removing product (optional)',
            reasonPlaceholder: 'e.g. Seasonal item discontinued, out of season, duplicate listing...',
            confirmLabel: 'Move to Trash (30 Days)',
        });
    };

    const openPermanentDeleteProductConfirm = (prod) => {
        setConfirmError('');
        setConfirmConfig({
            kind: 'PERMANENT_PRODUCT',
            target: prod,
            variant: 'danger',
            icon: 'delete_forever',
            title: `Permanently Delete "${prod.name}"?`,
            subtitle: `Product #${prod.sku || prod.product_id}`,
            description:
                'This bypasses the remaining 30-day Trash retention countdown and permanently removes the product from MongoDB immediately.',
            policyTitle: 'Irreversible Permanent Deletion',
            policyPoints: [
                'This action cannot be undone and the product cannot be restored afterwards.',
                'Historical customer order records will remain intact for accounting.',
            ],
            showReasonInput: false,
            confirmLabel: 'Delete Permanently',
        });
    };

    const openSuspendUserConfirm = (u) => {
        const displayName =
            [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email;
        setConfirmError('');
        setConfirmConfig({
            kind: 'SUSPEND_USER',
            target: u,
            variant: 'warning',
            icon: 'person_off',
            title: `Suspend "${displayName}" & Move to GDPR Trash?`,
            subtitle: `${u.email} • Role: ${u.role || 'USER'}`,
            description:
                'Suspending this account immediately blocks login and removes them from active Users while safely archiving their profile under GDPR data privacy rules.',
            policyTitle: 'GDPR Extended Data Retention Policy (365 Days)',
            policyPoints: [
                'In compliance with GDPR Art. 17(3)(b) (statutory tax, invoice & dispute retention), suspended user data is held for 365 days — much longer than the 30-day product trash.',
                'An administrator can restore the account back to active status anytime during the retention window.',
                'Once the 365-day GDPR period expires, personal profile, notifications, and tracking logs are automatically erased.',
            ],
            showReasonInput: true,
            reasonLabel: 'Suspension reason (recorded in GDPR audit log)',
            reasonPlaceholder: 'e.g. Policy violation, requested account pause, suspicious activity...',
            confirmLabel: 'Suspend & Archive to GDPR Trash',
        });
    };

    const openPermanentEraseUserConfirm = (u) => {
        const displayName =
            [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email;
        setConfirmError('');
        setConfirmConfig({
            kind: 'PERMANENT_USER',
            target: u,
            variant: 'danger',
            icon: 'gpp_maybe',
            title: `Execute GDPR Permanent Erasure for "${displayName}"?`,
            subtitle: `${u.email}`,
            description:
                'This executes immediate GDPR Right-to-Erasure before the 365-day retention window completes, permanently deleting the user account, notifications, and behavioral tracking records.',
            policyTitle: 'Irreversible GDPR Data Erasure',
            policyPoints: [
                'The user account cannot be restored once permanently erased.',
                'Statutory order/invoice rows remain anonymized for financial compliance.',
            ],
            showReasonInput: false,
            confirmLabel: 'GDPR Erase Permanently',
        });
    };

    const handleConfirmModalSubmit = async ({reason}) => {
        if (!confirmConfig || confirmBusy) return;
        setConfirmBusy(true);
        setConfirmError('');
        setError('');
        try {
            const {kind, target} = confirmConfig;
            let toastMessage = '✓ Action completed.';

            if (kind === 'TRASH_PRODUCT') {
                const res = await api.deleteAdminProduct(target.product_id, reason);
                toastMessage = `✓ ${res.data?.message || `Moved "${target.name}" to Trash.`}`;
                if (viewingProduct?.product_id === target.product_id) {
                    setViewingProduct(null);
                }
            } else if (kind === 'PERMANENT_PRODUCT') {
                const res = await api.permanentDeleteAdminProduct(target.product_id);
                toastMessage = `✓ ${res.data?.message || `Permanently deleted "${target.name}".`}`;
                if (viewingProduct?.product_id === target.product_id) {
                    setViewingProduct(null);
                }
            } else if (kind === 'SUSPEND_USER') {
                const res = await api.deleteAdminUser(target._id, reason);
                toastMessage = `✓ ${res.data?.message || `Suspended ${target.email} to GDPR Trash.`}`;
            } else if (kind === 'PERMANENT_USER') {
                const res = await api.permanentDeleteAdminUser(target._id);
                toastMessage = `✓ ${res.data?.message || `GDPR permanent erasure completed for ${target.email}.`}`;
            }

            setConfirmConfig(null);
            queryClient.invalidateQueries({queryKey: ['adminInventory']});
            queryClient.invalidateQueries({queryKey: ['adminUsers']});
            queryClient.invalidateQueries({queryKey: ['adminSellers']});
            queryClient.invalidateQueries({queryKey: ['adminTrash']});
            queryClient.invalidateQueries({queryKey: ['adminOverview']});
            queryClient.invalidateQueries({queryKey: ['adminLogs']});
            queryClient.invalidateQueries({queryKey: ['products']});
            queryClient.invalidateQueries({queryKey: ['notifications']});
            showToast(toastMessage);
        } catch (err) {
            setConfirmError(err.response?.data?.message || 'Action failed. Please try again.');
        } finally {
            setConfirmBusy(false);
        }
    };

    const handleRestoreProduct = async (prod) => {
        const key = `prod-${prod.product_id}`;
        setRestoringKey(key);
        setError('');
        try {
            const res = await api.restoreAdminTrashedProduct(prod.product_id);
            if (viewingProduct?.product_id === prod.product_id) {
                setViewingProduct(null);
            }
            queryClient.invalidateQueries({queryKey: ['adminTrash']});
            queryClient.invalidateQueries({queryKey: ['adminInventory']});
            queryClient.invalidateQueries({queryKey: ['adminOverview']});
            queryClient.invalidateQueries({queryKey: ['adminLogs']});
            queryClient.invalidateQueries({queryKey: ['products']});
            queryClient.invalidateQueries({queryKey: ['notifications']});
            showToast(`✓ ${res.data?.message || `Restored "${prod.name}" to active inventory!`}`);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to restore product.');
        } finally {
            setRestoringKey(null);
        }
    };

    const handleRestoreUser = async (u) => {
        const key = `user-${u._id}`;
        setRestoringKey(key);
        setError('');
        try {
            const res = await api.restoreAdminTrashedUser(u._id);
            queryClient.invalidateQueries({queryKey: ['adminTrash']});
            queryClient.invalidateQueries({queryKey: ['adminUsers']});
            queryClient.invalidateQueries({queryKey: ['adminSellers']});
            queryClient.invalidateQueries({queryKey: ['adminOverview']});
            queryClient.invalidateQueries({queryKey: ['adminLogs']});
            showToast(`✓ ${res.data?.message || `Restored account ${u.email}!`}`);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to restore user account.');
        } finally {
            setRestoringKey(null);
        }
    };

    const handleRunTrashCronNow = async () => {
        if (runningTrashCron) return;
        setRunningTrashCron(true);
        setError('');
        try {
            const res = await api.triggerAdminTrashPurgeNow();
            const d = res.data || {};
            queryClient.invalidateQueries({queryKey: ['adminTrash']});
            queryClient.invalidateQueries({queryKey: ['adminOverview']});
            queryClient.invalidateQueries({queryKey: ['adminLogs']});
            showToast(
                `✓ Automated cleanup sweep complete: purged ${d.purged_products || 0} expired product(s) & erased ${d.purged_users || 0} expired GDPR user(s).`
            );
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to run trash cleanup sweep.');
        } finally {
            setRunningTrashCron(false);
        }
    };

    const handleUpdateProductApproval = async (prod, nextStatus) => {
        let reason = '';
        if (nextStatus === 'REJECTED') {
            const promptRes = window.prompt(
                `Optional reason for rejecting "${prod.name}" (shown to the seller):`,
                prod.rejection_reason || ''
            );
            if (promptRes === null) return;
            reason = promptRes.trim();
        }
        setSavingProductId(prod.product_id);
        setError('');
        try {
            const res = await api.updateAdminProductApproval(prod.product_id, nextStatus, reason);
            queryClient.invalidateQueries({queryKey: ['adminInventory']});
            queryClient.invalidateQueries({queryKey: ['adminOverview']});
            queryClient.invalidateQueries({queryKey: ['products']});
            queryClient.invalidateQueries({queryKey: ['notifications']});
            queryClient.invalidateQueries({queryKey: ['adminLogs']});
            showToast(res.data?.message || `✓ Updated publishing status for "${prod.name}".`);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to update product approval status.');
        } finally {
            setSavingProductId(null);
        }
    };

    const handleReviewProductEdits = async (prod, action) => {
        let reason = '';
        if (action === 'REJECT') {
            const promptRes = window.prompt(
                `Optional reason for rejecting proposed edits to "${prod.name}" (shown to seller; previous live details will remain active):`,
                ''
            );
            if (promptRes === null) return;
            reason = promptRes.trim();
        }
        setSavingProductId(prod.product_id);
        setError('');
        try {
            const res = await api.reviewAdminProductPendingChanges(prod.product_id, action, reason);
            queryClient.invalidateQueries({queryKey: ['adminInventory']});
            queryClient.invalidateQueries({queryKey: ['adminOverview']});
            queryClient.invalidateQueries({queryKey: ['products']});
            queryClient.invalidateQueries({queryKey: ['notifications']});
            queryClient.invalidateQueries({queryKey: ['adminLogs']});
            showToast(res.data?.message || `✓ Reviewed edits for "${prod.name}".`);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to review product edits.');
        } finally {
            setSavingProductId(null);
        }
    };

    // Seller approval / rejection / suspension handler
    const handleUpdateSellerStatus = async (seller, nextStatus) => {
        const storeName =
            seller?.seller_profile?.store_name ||
            `${seller.first_name || ''} ${seller.last_name || ''}`.trim() ||
            seller.email;

        let reason = '';
        if (nextStatus === 'REJECTED' || nextStatus === 'SUSPENDED') {
            const promptRes = window.prompt(
                `Optional reason for setting "${storeName}" to ${nextStatus} (shown to seller):`,
                seller?.seller_profile?.rejection_reason || ''
            );
            if (promptRes === null) return;
            reason = promptRes.trim();
        }

        setUpdatingSellerId(seller._id);
        setError('');
        try {
            await api.updateAdminSellerStatus(seller._id, nextStatus, reason);
            queryClient.invalidateQueries({queryKey: ['adminSellers']});
            queryClient.invalidateQueries({queryKey: ['adminOverview']});
            queryClient.invalidateQueries({queryKey: ['adminUsers']});
            queryClient.invalidateQueries({queryKey: ['notifications']});
            queryClient.invalidateQueries({queryKey: ['adminLogs']});
            showToast(`✓ Updated seller "${storeName}" status to ${nextStatus}.`);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to update seller status.');
        } finally {
            setUpdatingSellerId(null);
        }
    };

    // User role toggle & delete handlers
    const handleToggleUserRole = async (u) => {
        const nextRole = u.role === 'ADMIN' ? 'USER' : 'ADMIN';
        setUpdatingUserId(u._id);
        setError('');
        try {
            await api.updateAdminUserRole(u._id, nextRole);
            queryClient.invalidateQueries({queryKey: ['adminUsers']});
            queryClient.invalidateQueries({queryKey: ['adminOverview']});
            showToast(`✓ Updated ${u.first_name} ${u.last_name}'s role to ${nextRole}.`);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to update user role.');
        } finally {
            setUpdatingUserId(null);
        }
    };

    const handleDeleteUser = (u) => {
        openSuspendUserConfirm(u);
    };

    // Add manual audit log note
    const handleAddAuditNote = async (e) => {
        e.preventDefault();
        if (!noteDetails.trim()) return;
        setError('');
        try {
            await api.createAdminLog({
                action: 'ADMIN_OPERATIONAL_LOG',
                category: noteCategory,
                severity: noteSeverity,
                target_id: 'CONSOLE',
                details: noteDetails.trim(),
            });
            setNoteDetails('');
            queryClient.invalidateQueries({queryKey: ['adminLogs']});
            queryClient.invalidateQueries({queryKey: ['adminOverview']});
            showToast('✓ Operational audit log recorded.');
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to record log.');
        }
    };

    const kpis = overview?.kpis || {};
    const charts = overview?.charts || {};
    const revenueTrend = charts.revenue_trend || [];
    const categoryDist = charts.category_distribution || [];
    const orderStatusDist = (charts.order_status_distribution || []).filter((d) => d.value > 0);
    const pieData =
        orderStatusDist.length > 0
            ? orderStatusDist
            : [{name: 'No Orders Yet', value: 1, color: '#cbd5e1'}];

    const distinctCategories = [
        'ALL',
        ...Array.from(new Set(inventory.map((p) => p.category).filter(Boolean))),
    ];

    const pendingApprovalProductsCount = inventory.filter(
        (p) => p.approval_status === 'PENDING_APPROVAL'
    ).length;
    const pendingEditsProductsCount = inventory.filter((p) => Boolean(p.pending_changes)).length;
    const rejectedProductsCount = inventory.filter(
        (p) => p.approval_status === 'REJECTED'
    ).length;

    const filteredInventory = inventory.filter((p) => {
        if (invCategory !== 'ALL' && p.category !== invCategory) return false;
        if (invStockFilter === 'LOW' && (p.stock <= 0 || p.stock > 25)) return false;
        if (invStockFilter === 'OUT' && p.stock > 0) return false;
        if (invStockFilter === 'FLASH' && !p.flash_sale) return false;
        if (invStockFilter === 'PENDING_APPROVAL' && p.approval_status !== 'PENDING_APPROVAL')
            return false;
        if (invStockFilter === 'PENDING_EDITS' && !p.pending_changes) return false;
        if (invStockFilter === 'REJECTED' && p.approval_status !== 'REJECTED') return false;
        if (invSearch.trim()) {
            const q = invSearch.trim().toLowerCase();
            return (
                String(p.name || '').toLowerCase().includes(q) ||
                String(p.product_id || '').toLowerCase().includes(q) ||
                String(p.sku || '').toLowerCase().includes(q) ||
                String(p.category || '').toLowerCase().includes(q) ||
                String(p.seller?.name || '').toLowerCase().includes(q)
            );
        }
        return true;
    });

    const filteredSellers = sellers.filter((s) => {
        const st = s.seller_profile?.status || 'PENDING';
        if (sellerStatusFilter !== 'ALL' && st !== sellerStatusFilter) return false;
        if (sellerSearch.trim()) {
            const q = sellerSearch.trim().toLowerCase();
            return (
                String(s.seller_profile?.store_name || '').toLowerCase().includes(q) ||
                String(s.first_name || '').toLowerCase().includes(q) ||
                String(s.last_name || '').toLowerCase().includes(q) ||
                String(s.email || '').toLowerCase().includes(q) ||
                String(s.seller_profile?.business_location || '').toLowerCase().includes(q)
            );
        }
        return true;
    });

    const paginatedSellers = filteredSellers.slice(
        (sellerPage - 1) * sellerRowsPerPage,
        sellerPage * sellerRowsPerPage
    );

    const filteredUsers = users.filter((u) => {
        if (userRoleFilter !== 'ALL' && u.role !== userRoleFilter) return false;
        if (userSearch.trim()) {
            const q = userSearch.trim().toLowerCase();
            return (
                String(u.first_name || '').toLowerCase().includes(q) ||
                String(u.last_name || '').toLowerCase().includes(q) ||
                String(u.email || '').toLowerCase().includes(q)
            );
        }
        return true;
    });

    const paginatedInventory = filteredInventory.slice(
        (invPage - 1) * invRowsPerPage,
        invPage * invRowsPerPage
    );

    const paginatedUsers = filteredUsers.slice(
        (userPage - 1) * userRowsPerPage,
        userPage * userRowsPerPage
    );

    const paginatedLogs = logs.slice(
        (logPage - 1) * logRowsPerPage,
        logPage * logRowsPerPage
    );

    const trashedProducts = trashData?.products || [];
    const trashedUsers = trashData?.users || [];
    const trashRetention = trashData?.retention || {product_days: 30, user_gdpr_days: 365};
    const trashCronStatus = trashData?.cron_status || overview?.trash_purge_cron || {};

    const filteredTrashedProducts = trashedProducts.filter((p) => {
        if (!trashSearch.trim()) return true;
        const q = trashSearch.trim().toLowerCase();
        return (
            String(p.name || '').toLowerCase().includes(q) ||
            String(p.product_id || '').toLowerCase().includes(q) ||
            String(p.category || '').toLowerCase().includes(q) ||
            String(p.deleted_by || '').toLowerCase().includes(q) ||
            String(p.delete_reason || '').toLowerCase().includes(q)
        );
    });

    const filteredTrashedUsers = trashedUsers.filter((u) => {
        if (!trashSearch.trim()) return true;
        const q = trashSearch.trim().toLowerCase();
        return (
            String(u.first_name || '').toLowerCase().includes(q) ||
            String(u.last_name || '').toLowerCase().includes(q) ||
            String(u.email || '').toLowerCase().includes(q) ||
            String(u.deleted_by || '').toLowerCase().includes(q) ||
            String(u.suspension_reason || '').toLowerCase().includes(q)
        );
    });

    const activeTrashList =
        trashSubTab === 'products' ? filteredTrashedProducts : filteredTrashedUsers;
    const paginatedTrash = activeTrashList.slice(
        (trashPage - 1) * trashRowsPerPage,
        trashPage * trashRowsPerPage
    );

    const getHeaderMeta = () => {
        if (activeTab === 'inventory') {
            return {
                title: 'Live Product & Inventory Manager',
                subtitle:
                    'View full product details, open the 5-step Full Edit wizard, inline quick-edit, or move products to 30-day Trash.',
            };
        }
        if (activeTab === 'sellers') {
            return {
                title: 'Marketplace Sellers & Approval Requests',
                subtitle:
                    'Approve or reject new seller portal requests, monitor seller sales, returns, earnings, and customer ratings.',
            };
        }
        if (activeTab === 'users') {
            return {
                title: 'User & Role Management',
                subtitle:
                    'View customer order history, lifetime spend, active carts, manage Admin permissions, or suspend accounts into GDPR Trash.',
            };
        }
        if (activeTab === 'trash') {
            return {
                title: 'Trash Bin & GDPR Data Retention',
                subtitle:
                    'Restore deleted products within 30 days or suspended user accounts within the extended 365-day GDPR statutory retention window.',
            };
        }
        if (activeTab === 'logs') {
            return {
                title: 'System Audit & Activity Logs',
                subtitle:
                    'Real-time trace of order updates, shipment dispatches, stock edits, trash restorations, and security changes.',
            };
        }
        return {
            title: 'Executive Analytics & Operations Dashboard',
            subtitle:
                'Real-time revenue charts, category stock metrics, dispatch performance, and audit logs.',
        };
    };

    const headerMeta = getHeaderMeta();

    return (
        <AdminLayout
            title={headerMeta.title}
            subtitle={headerMeta.subtitle}
            activeTab={activeTab}
            actions={
                <div className={styles['top-tab-pills']}>
                    {[
                        {id: 'overview', icon: 'monitoring', label: 'Analytics'},
                        {
                            id: 'inventory',
                            icon: 'inventory_2',
                            label: 'Inventory',
                            badge:
                                (kpis.pending_products_count || 0) +
                                (kpis.pending_product_edits_count || 0),
                        },
                        {
                            id: 'sellers',
                            icon: 'store',
                            label: 'Sellers',
                            badge: kpis.pending_sellers_count || 0,
                        },
                        {id: 'users', icon: 'group', label: 'Users'},
                        {
                            id: 'trash',
                            icon: 'delete_sweep',
                            label: 'Trash & GDPR',
                            badge:
                                (kpis.trashed_products_count || 0) +
                                (kpis.trashed_users_count || 0),
                        },
                        {id: 'logs', icon: 'terminal', label: 'Audit Logs'},
                    ].map((t) => (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => setTab(t.id)}
                            className={`${styles['tab-pill']} ${
                                activeTab === t.id ? styles['tab-pill-active'] : ''
                            }`}
                        >
                            <span className="material-symbols-outlined">{t.icon}</span>
                            <span>{t.label}</span>
                            {t.badge > 0 && (
                                <span className={styles['tab-pill-badge']}>{t.badge}</span>
                            )}
                        </button>
                    ))}
                </div>
            }
        >
            {feedback && <div className={styles['toast-success']}>{feedback}</div>}
            {error && <div className={styles['toast-error']}>{error}</div>}

            {/* ==================== TAB 1: ANALYTICS OVERVIEW ==================== */}
            {activeTab === 'overview' && (
                <>
                    {loadingOverview ? (
                        <Loading/>
                    ) : (
                        <>
                            {/* Automated Inventory Monitor Status Bar */}
                            <div className={styles['cron-status-bar']}>
                                <div className={styles['cron-status-info']}>
                                    <span className={styles['cron-dot']}/>
                                    <span>
                                        <strong>Automated Low-Stock Monitor:</strong> Checks every 5
                                        minutes (threshold ≤ {overview?.low_stock_threshold || 10}{' '}
                                        units • email reminders max once every 6 hrs) • Last check:{' '}
                                        <strong>
                                            {overview?.stock_monitor_cron?.last_run_at
                                                ? formatDateTime(
                                                      overview.stock_monitor_cron.last_run_at
                                                  )
                                                : 'Active'}
                                        </strong>
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    disabled={runningStockCron}
                                    onClick={handleRunStockCronNow}
                                    className={styles['cron-run-btn']}
                                >
                                    <span className="material-symbols-outlined">autorenew</span>
                                    <span>
                                        {runningStockCron ? 'Scanning Stock...' : 'Run Stock Scan Now'}
                                    </span>
                                </button>
                            </div>

                            {/* Live Low-Stock & Sold-Out Alert Banner */}
                            {(overview?.critical_stock_alerts || []).length > 0 && (
                                <div
                                    className={`${styles['stock-alert-banner']} ${
                                        (kpis.out_of_stock_count || 0) > 0
                                            ? styles['stock-alert-critical']
                                            : styles['stock-alert-warn']
                                    }`}
                                >
                                    <div className={styles['stock-alert-left']}>
                                        <span className="material-symbols-outlined">
                                            {(kpis.out_of_stock_count || 0) > 0
                                                ? 'report'
                                                : 'warning'}
                                        </span>
                                        <div>
                                            <strong>
                                                {(kpis.out_of_stock_count || 0) > 0
                                                    ? `Inventory Alert: ${kpis.out_of_stock_count} Sold Out & ${kpis.low_stock_count || 0} Low Stock (≤ ${
                                                          overview?.low_stock_threshold || 10
                                                      } units)`
                                                    : `Low Stock Alert: ${kpis.low_stock_count} product(s) at ≤ ${
                                                          overview?.low_stock_threshold || 10
                                                      } units`}
                                            </strong>
                                            <div className={styles['stock-alert-chips']}>
                                                {(overview?.critical_stock_alerts || [])
                                                    .slice(0, 6)
                                                    .map((item) => (
                                                        <span
                                                            key={item.product_id}
                                                            className={`${styles['alert-item-chip']} ${
                                                                item.stock <= 0
                                                                    ? styles['alert-chip-out']
                                                                    : styles['alert-chip-low']
                                                            }`}
                                                        >
                                                            {item.name}:{' '}
                                                            {item.stock <= 0
                                                                ? 'SOLD OUT'
                                                                : `${item.stock} left`}
                                                        </span>
                                                    ))}
                                            </div>
                                        </div>
                                    </div>
                                    <div className={styles['stock-alert-actions']}>
                                        {(kpis.out_of_stock_count || 0) > 0 && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    navigate('/admin?tab=inventory&stock=OUT')
                                                }
                                                className={styles['restock-danger-btn']}
                                            >
                                                Restock Sold Out →
                                            </button>
                                        )}
                                        {(kpis.low_stock_count || 0) > 0 && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    navigate('/admin?tab=inventory&stock=LOW')
                                                }
                                                className={styles['restock-warn-btn']}
                                            >
                                                View Low Stock →
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Seller Marketplace Requests, Pending Products, Edits & Order Updates Alert Strip */}
                            {((kpis.pending_sellers_count || 0) > 0 ||
                                (kpis.pending_products_count || 0) > 0 ||
                                (kpis.pending_product_edits_count || 0) > 0 ||
                                (kpis.pending_seller_order_updates || 0) > 0) && (
                                <div className={styles['seller-action-banner']}>
                                    <div className={styles['stock-alert-left']}>
                                        <span className="material-symbols-outlined">store</span>
                                        <div>
                                            <strong>Marketplace Seller Action Needed</strong>
                                            <p className={styles['seller-banner-sub']}>
                                                {[
                                                    (kpis.pending_sellers_count || 0) > 0
                                                        ? `${kpis.pending_sellers_count} pending seller application(s)`
                                                        : null,
                                                    (kpis.pending_products_count || 0) > 0
                                                        ? `${kpis.pending_products_count} new product(s) awaiting publishing`
                                                        : null,
                                                    (kpis.pending_product_edits_count || 0) > 0
                                                        ? `${kpis.pending_product_edits_count} published product edit(s) awaiting approval`
                                                        : null,
                                                    (kpis.pending_seller_order_updates || 0) > 0
                                                        ? `${kpis.pending_seller_order_updates} seller order status update(s)`
                                                        : null,
                                                ]
                                                    .filter(Boolean)
                                                    .join(' • ')}
                                            </p>
                                        </div>
                                    </div>
                                    <div className={styles['stock-alert-actions']}>
                                        {(kpis.pending_products_count || 0) > 0 && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    navigate(
                                                        '/admin?tab=inventory&stock=PENDING_APPROVAL'
                                                    )
                                                }
                                                className={styles['btn-emerald']}
                                            >
                                                Approve Products ({kpis.pending_products_count}) →
                                            </button>
                                        )}
                                        {(kpis.pending_product_edits_count || 0) > 0 && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    navigate(
                                                        '/admin?tab=inventory&stock=PENDING_EDITS'
                                                    )
                                                }
                                                className={styles['restock-warn-btn']}
                                            >
                                                Review Product Edits (
                                                {kpis.pending_product_edits_count}) →
                                            </button>
                                        )}
                                        {(kpis.pending_sellers_count || 0) > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => setTab('sellers')}
                                                className={styles['btn-emerald']}
                                            >
                                                Approve Sellers ({kpis.pending_sellers_count}) →
                                            </button>
                                        )}
                                        {(kpis.pending_seller_order_updates || 0) > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => navigate('/admin/orders')}
                                                className={styles['restock-warn-btn']}
                                            >
                                                Review Seller Order Updates (
                                                {kpis.pending_seller_order_updates}) →
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* 6 Executive KPI Cards */}
                            <div className={styles['kpi-grid']}>
                                <div className={styles['kpi-card']}>
                                    <div className={`${styles['kpi-icon']} ${styles['kpi-emerald']}`}>
                                        <span className="material-symbols-outlined">payments</span>
                                    </div>
                                    <div className={styles['kpi-body']}>
                                        <small>Total Store Revenue</small>
                                        <strong>{formatKES(kpis.total_revenue || 0)} KES</strong>
                                        <span>
                                            Avg. Order: {formatKES(kpis.avg_order_value || 0)} KES
                                        </span>
                                    </div>
                                </div>

                                <div className={styles['kpi-card']}>
                                    <div className={`${styles['kpi-icon']} ${styles['kpi-blue']}`}>
                                        <span className="material-symbols-outlined">
                                            receipt_long
                                        </span>
                                    </div>
                                    <div className={styles['kpi-body']}>
                                        <small>Total Orders</small>
                                        <strong>{kpis.total_orders || 0}</strong>
                                        <span>
                                            {kpis.fulfilled_orders || 0} Fulfilled •{' '}
                                            {kpis.pending_orders || 0} Active
                                        </span>
                                    </div>
                                </div>

                                <div className={styles['kpi-card']}>
                                    <div className={`${styles['kpi-icon']} ${styles['kpi-amber']}`}>
                                        <span className="material-symbols-outlined">
                                            local_shipping
                                        </span>
                                    </div>
                                    <div className={styles['kpi-body']}>
                                        <small>Express Dispatches</small>
                                        <strong>{kpis.delivered_shipments || 0} Delivered</strong>
                                        <span>
                                            {kpis.in_transit_shipments || 0} In Transit •{' '}
                                            {kpis.pickup_stations_count || 0} Pickup Hubs
                                        </span>
                                    </div>
                                </div>

                                <div className={styles['kpi-card']}>
                                    <div className={`${styles['kpi-icon']} ${styles['kpi-purple']}`}>
                                        <span className="material-symbols-outlined">
                                            inventory_2
                                        </span>
                                    </div>
                                    <div className={styles['kpi-body']}>
                                        <small>Catalog & Stock Value</small>
                                        <strong>{kpis.total_products || 0} Products</strong>
                                        <span>
                                            {formatKES(kpis.total_inventory_value || 0)} KES across{' '}
                                            {kpis.total_stock_units || 0} units
                                        </span>
                                    </div>
                                </div>

                                <div className={styles['kpi-card']}>
                                    <div className={`${styles['kpi-icon']} ${styles['kpi-indigo']}`}>
                                        <span className="material-symbols-outlined">group</span>
                                    </div>
                                    <div className={styles['kpi-body']}>
                                        <small>Registered Accounts</small>
                                        <strong>{kpis.total_users || 0} Users</strong>
                                        <span>
                                            {kpis.admin_users_count || 0} Admins •{' '}
                                            {kpis.approved_sellers_count || 0} Sellers •{' '}
                                            {kpis.customer_users_count || 0} Customers
                                        </span>
                                    </div>
                                </div>

                                <div className={styles['kpi-card']}>
                                    <div className={`${styles['kpi-icon']} ${styles['kpi-rose']}`}>
                                        <span className="material-symbols-outlined">bolt</span>
                                    </div>
                                    <div className={styles['kpi-body']}>
                                        <small>Promos & Stock Alerts</small>
                                        <strong>{kpis.flash_sale_count || 0} Flash Deals</strong>
                                        <span>
                                            {kpis.low_stock_count || 0} Low Stock •{' '}
                                            {kpis.out_of_stock_count || 0} Sold Out
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Recharts Row 1: 7-Day Revenue AreaChart + Order Status Donut PieChart */}
                            <div className={styles['charts-row-2']}>
                                <div className={styles['chart-card']}>
                                    <div className={styles['chart-head']}>
                                        <div>
                                            <h3>7-Day Revenue & Order Performance (KES)</h3>
                                            <p>Daily checkout revenue and order volume over the past 7 days</p>
                                        </div>
                                        <Link to="/admin/orders" className={styles['chart-link']}>
                                            View Orders →
                                        </Link>
                                    </div>

                                    <div className={styles['chart-box']}>
                                        <ResponsiveContainer width="100%" height={290}>
                                            <AreaChart
                                                data={revenueTrend}
                                                margin={{top: 10, right: 16, left: 0, bottom: 0}}
                                            >
                                                <defs>
                                                    <linearGradient
                                                        id="revGradient"
                                                        x1="0"
                                                        y1="0"
                                                        x2="0"
                                                        y2="1"
                                                    >
                                                        <stop
                                                            offset="5%"
                                                            stopColor="#10b981"
                                                            stopOpacity={0.38}
                                                        />
                                                        <stop
                                                            offset="95%"
                                                            stopColor="#10b981"
                                                            stopOpacity={0.02}
                                                        />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid
                                                    strokeDasharray="3 3"
                                                    stroke="#f1f5f9"
                                                />
                                                <XAxis
                                                    dataKey="day"
                                                    tick={{fontSize: 12, fill: '#64748b'}}
                                                />
                                                <YAxis
                                                    tick={{fontSize: 12, fill: '#64748b'}}
                                                    tickFormatter={(v) => `${v}`}
                                                />
                                                <Tooltip
                                                    formatter={(value, name) =>
                                                        name === 'revenue'
                                                            ? [`${formatKES(value)} KES`, 'Revenue']
                                                            : [value, 'Orders']
                                                    }
                                                    contentStyle={{
                                                        borderRadius: '14px',
                                                        border: '1px solid #e2e8f0',
                                                    }}
                                                />
                                                <Legend/>
                                                <Area
                                                    type="monotone"
                                                    dataKey="revenue"
                                                    name="Revenue (KES)"
                                                    stroke="#059669"
                                                    strokeWidth={3}
                                                    fillOpacity={1}
                                                    fill="url(#revGradient)"
                                                />
                                                <Area
                                                    type="monotone"
                                                    dataKey="orders"
                                                    name="Orders Count"
                                                    stroke="#3b82f6"
                                                    strokeWidth={2}
                                                    fillOpacity={0}
                                                />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                <div className={styles['chart-card']}>
                                    <div className={styles['chart-head']}>
                                        <div>
                                            <h3>Order Status Breakdown</h3>
                                            <p>Distribution by fulfillment stage</p>
                                        </div>
                                        <Link
                                            to="/admin/orders/update"
                                            className={styles['chart-link']}
                                        >
                                            Update →
                                        </Link>
                                    </div>

                                    <div className={styles['chart-box']}>
                                        <ResponsiveContainer width="100%" height={290}>
                                            <PieChart>
                                                <Pie
                                                    data={pieData}
                                                    cx="50%"
                                                    cy="48%"
                                                    innerRadius={58}
                                                    outerRadius={92}
                                                    paddingAngle={4}
                                                    dataKey="value"
                                                    nameKey="name"
                                                >
                                                    {pieData.map((entry, index) => (
                                                        <Cell
                                                            key={`cell-${index}`}
                                                            fill={
                                                                entry.color ||
                                                                PIE_COLORS[index % PIE_COLORS.length]
                                                            }
                                                        />
                                                    ))}
                                                </Pie>
                                                <Tooltip
                                                    contentStyle={{
                                                        borderRadius: '12px',
                                                        border: '1px solid #e2e8f0',
                                                    }}
                                                />
                                                <Legend/>
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            </div>

                            {/* Recharts Row 2: Category Stock & Inventory Value BarChart */}
                            <div className={styles['chart-card']}>
                                <div className={styles['chart-head']}>
                                    <div>
                                        <h3>Inventory Stock Units & Average Price by Category</h3>
                                        <p>
                                            Comparison of available stock units and average unit price (KES) across all 8 supermarket aisles
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setTab('inventory')}
                                        className={styles['chart-btn']}
                                    >
                                        Manage Catalog →
                                    </button>
                                </div>

                                <div className={styles['chart-box']}>
                                    <ResponsiveContainer width="100%" height={300}>
                                        <BarChart
                                            data={categoryDist}
                                            margin={{top: 10, right: 20, left: 0, bottom: 10}}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                                            <XAxis
                                                dataKey="short_name"
                                                tick={{fontSize: 12, fill: '#475569'}}
                                            />
                                            <YAxis tick={{fontSize: 12, fill: '#64748b'}}/>
                                            <Tooltip
                                                contentStyle={{
                                                    borderRadius: '14px',
                                                    border: '1px solid #e2e8f0',
                                                }}
                                            />
                                            <Legend/>
                                            <Bar
                                                dataKey="total_stock"
                                                name="Total Stock Units"
                                                fill="#10b981"
                                                radius={[8, 8, 0, 0]}
                                            />
                                            <Bar
                                                dataKey="avg_price"
                                                name="Avg Unit Price (KES)"
                                                fill="#3b82f6"
                                                radius={[8, 8, 0, 0]}
                                            />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Bottom 3 Operational Panels: Recent Orders, Stock Watchlist, Recent Audit Logs */}
                            <div className={styles['ops-grid']}>
                                {/* Recent Orders */}
                                <div className={styles['panel-card']}>
                                    <div className={styles['panel-head']}>
                                        <h3>Recent Customer Orders</h3>
                                        <Link to="/admin/orders">See All →</Link>
                                    </div>

                                    {(overview?.recent_orders || []).length === 0 ? (
                                        <p className={styles['empty-text']}>No orders placed yet.</p>
                                    ) : (
                                        <div className={styles['feed-list']}>
                                            {(overview?.recent_orders || []).map((ord) => (
                                                <div
                                                    key={ord.order_id}
                                                    className={styles['feed-row']}
                                                >
                                                    <div>
                                                        <Link
                                                            to={`/admin/orders/${ord.order_id}`}
                                                            className={styles['feed-id']}
                                                        >
                                                            #{ord.order_id}
                                                        </Link>
                                                        <strong>{ord.customer_name}</strong>
                                                        <small>
                                                            {ord.items_count} items •{' '}
                                                            {ord.delivery_method === 'PICKUP_STATION'
                                                                ? 'Pickup Hub'
                                                                : 'Doorstep'}
                                                        </small>
                                                    </div>
                                                    <div className={styles['feed-right']}>
                                                        <strong>{formatKES(ord.total)} KES</strong>
                                                        {(() => {
                                                            const stMeta = getStatusMeta(ord.status);
                                                            return (
                                                                <span
                                                                    className={`${styles['mini-badge']} ${
                                                                        styles[`st-${stMeta.tone}`] || ''
                                                                    }`}
                                                                >
                                                                    {stMeta.shortLabel}
                                                                </span>
                                                            );
                                                        })()}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Low Stock Watchlist */}
                                <div className={styles['panel-card']}>
                                    <div className={styles['panel-head']}>
                                        <h3>Stock Watchlist (Lowest Stock)</h3>
                                        <button
                                            type="button"
                                            onClick={() => setTab('inventory')}
                                        >
                                            Restock →
                                        </button>
                                    </div>

                                    <div className={styles['feed-list']}>
                                        {(overview?.low_stock_products || []).map((prod) => (
                                            <div
                                                key={prod.product_id}
                                                className={styles['feed-row']}
                                            >
                                                <div className={styles['prod-mini']}>
                                                    <img src={prod.image} alt={prod.name}/>
                                                    <div>
                                                        <strong>{prod.name}</strong>
                                                        <small>{prod.category}</small>
                                                    </div>
                                                </div>
                                                <div className={styles['feed-right']}>
                                                    <span
                                                        className={`${styles['stock-chip']} ${
                                                            prod.stock <= 10
                                                                ? styles['stock-critical']
                                                                : styles['stock-warn']
                                                        }`}
                                                    >
                                                        {prod.stock} left
                                                    </span>
                                                    <small>{formatKES(prod.price)} KES</small>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Recent System Audit Logs */}
                                <div className={styles['panel-card']}>
                                    <div className={styles['panel-head']}>
                                        <h3>Latest Audit Logs</h3>
                                        <button type="button" onClick={() => setTab('logs')}>
                                            Full Log →
                                        </button>
                                    </div>

                                    <div className={styles['feed-list']}>
                                        {(overview?.recent_logs || []).slice(0, 6).map((log) => (
                                            <div
                                                key={log.log_id || log._id}
                                                className={styles['log-mini-row']}
                                            >
                                                <span
                                                    className={`${styles['sev-dot']} ${
                                                        styles[
                                                            `sev-${String(
                                                                log.severity || 'INFO'
                                                            ).toLowerCase()}`
                                                        ]
                                                    }`}
                                                />
                                                <div className={styles['log-mini-body']}>
                                                    <div className={styles['log-mini-top']}>
                                                        <strong>{log.action}</strong>
                                                        <small>
                                                            {formatDateTime(log.created_at)}
                                                        </small>
                                                    </div>
                                                    <p>{log.details}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </>
            )}

            {/* ==================== TAB 2: INVENTORY MANAGER ==================== */}
            {activeTab === 'inventory' && (
                <div className={styles['section-card']}>
                    <div className={styles['toolbar']}>
                        <div className={styles['search-box']}>
                            <span className="material-symbols-outlined">search</span>
                            <input
                                type="text"
                                value={invSearch}
                                onChange={(e) => {
                                    setInvSearch(e.target.value);
                                    setInvPage(1);
                                }}
                                placeholder="Search products by name, ID, SKU, or category..."
                            />
                        </div>

                        <select
                            value={invCategory}
                            onChange={(e) => {
                                setInvCategory(e.target.value);
                                setInvPage(1);
                            }}
                            className={styles['select-input']}
                        >
                            {distinctCategories.map((c) => (
                                <option key={c} value={c}>
                                    {c === 'ALL' ? 'All Categories' : c}
                                </option>
                            ))}
                        </select>

                        <select
                            value={invStockFilter}
                            onChange={(e) => {
                                setInvStockFilter(e.target.value);
                                setInvPage(1);
                            }}
                            className={styles['select-input']}
                        >
                            <option value="ALL">All Products ({inventory.length})</option>
                            <option value="PENDING_APPROVAL">
                                ⏳ Pending Publishing ({pendingApprovalProductsCount})
                            </option>
                            <option value="PENDING_EDITS">
                                ✏️ Pending Seller Edits ({pendingEditsProductsCount})
                            </option>
                            <option value="REJECTED">
                                ✕ Rejected Products ({rejectedProductsCount})
                            </option>
                            <option value="LOW">Low Stock (≤ 25)</option>
                            <option value="OUT">Out of Stock (0)</option>
                            <option value="FLASH">⚡ Flash Sale Items</option>
                        </select>

                        <div className={styles['toolbar-right']}>
                            <Link to="/admin/products/new" className={styles['btn-emerald']}>
                                <span className="material-symbols-outlined">add</span>
                                <span>Add New Product</span>
                            </Link>
                            <Link to="/admin/products/update" className={styles['btn-outline']}>
                                <span className="material-symbols-outlined">upload_file</span>
                                <span>Bulk CSV</span>
                            </Link>
                        </div>
                    </div>

                    {loadingInventory ? (
                        <Loading/>
                    ) : (
                        <>
                            <div className={styles['table-wrap']}>
                                <table className={styles['modern-table']}>
                                    <thead>
                                        <tr>
                                            <th>Product</th>
                                            <th>Publishing</th>
                                            <th>Category</th>
                                            <th>Base Price (KES)</th>
                                            <th>Discount %</th>
                                            <th>Stock Units</th>
                                            <th>Flash Sale</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedInventory.map((prod) => {
                                            const isEditing =
                                                editingProduct?.product_id === prod.product_id;
                                            const shortId =
                                                prod.sku ||
                                                String(prod.product_id || '').slice(0, 8);
                                            const approvalStatus =
                                                prod.approval_status || 'APPROVED';
                                            const isPendingPub =
                                                approvalStatus === 'PENDING_APPROVAL';
                                            const isRejectedPub = approvalStatus === 'REJECTED';
                                            const isSellerOwned = Boolean(prod.seller?.seller_id);
                                            return (
                                                <tr key={prod.product_id}>
                                                    <td>
                                                        <div className={styles['table-prod']}>
                                                            <img src={prod.image} alt={prod.name}/>
                                                            <div>
                                                                <Link
                                                                    to={`/products/${prod.product_id}`}
                                                                    className={styles['prod-link']}
                                                                >
                                                                    {prod.name}
                                                                </Link>
                                                                <small title={prod.product_id}>
                                                                    #{shortId} • {prod.weight}
                                                                    {prod.measurement}
                                                                </small>
                                                                {isSellerOwned && (
                                                                    <small
                                                                        style={{
                                                                            display: 'block',
                                                                            color: '#047857',
                                                                            fontWeight: 700,
                                                                        }}
                                                                    >
                                                                        🏪 {prod.seller.name}
                                                                    </small>
                                                                )}
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
                                                                className={`${styles['seller-st-pill']} ${
                                                                    isPendingPub
                                                                        ? styles['seller-st-pending']
                                                                        : isRejectedPub
                                                                        ? styles['seller-st-blocked']
                                                                        : styles['seller-st-approved']
                                                                }`}
                                                            >
                                                                {isPendingPub
                                                                    ? '⏳ Pending Publishing'
                                                                    : isRejectedPub
                                                                    ? '✕ Rejected'
                                                                    : '✓ Published'}
                                                            </span>
                                                            {isRejectedPub &&
                                                                prod.rejection_reason && (
                                                                    <small
                                                                        style={{
                                                                            fontSize: '0.7rem',
                                                                            color: '#b91c1c',
                                                                            maxWidth: '170px',
                                                                        }}
                                                                    >
                                                                        {prod.rejection_reason}
                                                                    </small>
                                                                )}
                                                            {prod.pending_changes && (
                                                                <div
                                                                    style={{
                                                                        marginTop: '0.2rem',
                                                                        background: '#fffbeb',
                                                                        border: '1px solid #fcd34d',
                                                                        borderRadius: '10px',
                                                                        padding: '0.4rem 0.55rem',
                                                                        display: 'flex',
                                                                        flexDirection: 'column',
                                                                        gap: '0.15rem',
                                                                        maxWidth: '230px',
                                                                    }}
                                                                >
                                                                    <strong
                                                                        style={{
                                                                            fontSize: '0.7rem',
                                                                            color: '#92400e',
                                                                        }}
                                                                    >
                                                                        ✏️ Seller Edits Pending:
                                                                    </strong>
                                                                    {(
                                                                        prod.pending_changes
                                                                            .diff_summary || []
                                                                    )
                                                                        .slice(0, 4)
                                                                        .map((d, idx) => (
                                                                            <small
                                                                                key={idx}
                                                                                style={{
                                                                                    fontSize:
                                                                                        '0.69rem',
                                                                                    color: '#78350f',
                                                                                    lineHeight: 1.25,
                                                                                }}
                                                                            >
                                                                                <b>{d.field}:</b>{' '}
                                                                                {d.from} → {d.to}
                                                                            </small>
                                                                        ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span className={styles['cat-chip']}>
                                                            {prod.category}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        {isEditing ? (
                                                            <input
                                                                type="number"
                                                                value={editingProduct.price}
                                                                onChange={(e) =>
                                                                    setEditingProduct((prev) => ({
                                                                        ...prev,
                                                                        price: e.target.value,
                                                                    }))
                                                                }
                                                                className={styles['inline-input']}
                                                            />
                                                        ) : (
                                                            <strong>
                                                                {formatKES(prod.price)} KES
                                                            </strong>
                                                        )}
                                                    </td>
                                                    <td>
                                                        {isEditing ? (
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                max="90"
                                                                value={editingProduct.discount}
                                                                onChange={(e) =>
                                                                    setEditingProduct((prev) => ({
                                                                        ...prev,
                                                                        discount: e.target.value,
                                                                    }))
                                                                }
                                                                className={styles['inline-input']}
                                                            />
                                                        ) : prod.discount > 0 ? (
                                                            <span className={styles['disc-badge']}>
                                                                -{prod.discount}%
                                                            </span>
                                                        ) : (
                                                            <span className={styles['muted']}>
                                                                0%
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        {isEditing ? (
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                value={editingProduct.stock}
                                                                onChange={(e) =>
                                                                    setEditingProduct((prev) => ({
                                                                        ...prev,
                                                                        stock: e.target.value,
                                                                    }))
                                                                }
                                                                className={styles['inline-input']}
                                                            />
                                                        ) : (
                                                            <span
                                                                className={`${styles['stock-chip']} ${
                                                                    prod.stock <= 0
                                                                        ? styles['stock-critical']
                                                                        : prod.stock <= 15
                                                                        ? styles['stock-warn']
                                                                        : styles['stock-ok']
                                                                }`}
                                                            >
                                                                {prod.stock} units
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        {isEditing ? (
                                                            <input
                                                                type="checkbox"
                                                                checked={editingProduct.flash_sale}
                                                                onChange={(e) =>
                                                                    setEditingProduct((prev) => ({
                                                                        ...prev,
                                                                        flash_sale:
                                                                            e.target.checked,
                                                                    }))
                                                                }
                                                            />
                                                        ) : prod.flash_sale ? (
                                                            <span className={styles['flash-tag']}>
                                                                ⚡ Active
                                                            </span>
                                                        ) : (
                                                            <span className={styles['muted']}>
                                                                —
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <div className={styles['row-actions']}>
                                                            {isEditing ? (
                                                                <>
                                                                    <IconActionButton
                                                                        icon="check"
                                                                        label="Save Quick Edit"
                                                                        tone="emerald"
                                                                        disabled={
                                                                            savingProductId ===
                                                                            prod.product_id
                                                                        }
                                                                        onClick={() =>
                                                                            handleSaveProductQuick(
                                                                                prod.product_id
                                                                            )
                                                                        }
                                                                    />
                                                                    <IconActionButton
                                                                        icon="close"
                                                                        label="Cancel Quick Edit"
                                                                        tone="neutral"
                                                                        onClick={() =>
                                                                            setEditingProduct(null)
                                                                        }
                                                                    />
                                                                </>
                                                            ) : (
                                                                <>
                                                                    {prod.pending_changes && (
                                                                        <>
                                                                            <IconActionButton
                                                                                icon="fact_check"
                                                                                label="Approve Seller Changes"
                                                                                tone="emerald"
                                                                                disabled={
                                                                                    savingProductId ===
                                                                                    prod.product_id
                                                                                }
                                                                                onClick={() =>
                                                                                    handleReviewProductEdits(
                                                                                        prod,
                                                                                        'APPROVE'
                                                                                    )
                                                                                }
                                                                            />
                                                                            <IconActionButton
                                                                                icon="unpublished"
                                                                                label="Reject Seller Changes"
                                                                                tone="danger"
                                                                                disabled={
                                                                                    savingProductId ===
                                                                                    prod.product_id
                                                                                }
                                                                                onClick={() =>
                                                                                    handleReviewProductEdits(
                                                                                        prod,
                                                                                        'REJECT'
                                                                                    )
                                                                                }
                                                                            />
                                                                        </>
                                                                    )}
                                                                    {(isPendingPub || isRejectedPub) && (
                                                                        <IconActionButton
                                                                            icon="check_circle"
                                                                            label="Approve & Publish"
                                                                            tone="emerald"
                                                                            disabled={
                                                                                savingProductId ===
                                                                                prod.product_id
                                                                            }
                                                                            onClick={() =>
                                                                                handleUpdateProductApproval(
                                                                                    prod,
                                                                                    'APPROVED'
                                                                                )
                                                                            }
                                                                        />
                                                                    )}
                                                                    {isPendingPub && (
                                                                        <IconActionButton
                                                                            icon="cancel"
                                                                            label="Reject Product"
                                                                            tone="danger"
                                                                            disabled={
                                                                                savingProductId ===
                                                                                prod.product_id
                                                                            }
                                                                            onClick={() =>
                                                                                handleUpdateProductApproval(
                                                                                    prod,
                                                                                    'REJECTED'
                                                                                )
                                                                            }
                                                                        />
                                                                    )}
                                                                    {!isPendingPub &&
                                                                        !isRejectedPub &&
                                                                        isSellerOwned && (
                                                                            <IconActionButton
                                                                                icon="visibility_off"
                                                                                label="Unpublish Product"
                                                                                tone="amber"
                                                                                disabled={
                                                                                    savingProductId ===
                                                                                    prod.product_id
                                                                                }
                                                                                onClick={() =>
                                                                                    handleUpdateProductApproval(
                                                                                        prod,
                                                                                        'PENDING_APPROVAL'
                                                                                    )
                                                                                }
                                                                            />
                                                                        )}
                                                                    <IconActionButton
                                                                        icon="visibility"
                                                                        label="View Product Details"
                                                                        tone="blue"
                                                                        onClick={() =>
                                                                            setViewingProduct(prod)
                                                                        }
                                                                    />
                                                                    <IconActionButton
                                                                        icon="edit_square"
                                                                        label="Full Edit Product"
                                                                        tone="emerald-soft"
                                                                        onClick={() =>
                                                                            navigate(
                                                                                `/admin/products/edit/${prod.product_id}`
                                                                            )
                                                                        }
                                                                    />
                                                                    <IconActionButton
                                                                        icon="bolt"
                                                                        label="Quick Edit Price & Stock"
                                                                        tone="neutral"
                                                                        onClick={() =>
                                                                            startEditProduct(prod)
                                                                        }
                                                                    />
                                                                    <IconActionButton
                                                                        icon="delete_outline"
                                                                        label="Move to Trash (30 Days)"
                                                                        tone="danger"
                                                                        onClick={() =>
                                                                            openTrashProductConfirm(
                                                                                prod
                                                                            )
                                                                        }
                                                                    />
                                                                </>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            <TablePagination
                                totalItems={filteredInventory.length}
                                currentPage={invPage}
                                rowsPerPage={invRowsPerPage}
                                onPageChange={setInvPage}
                                onRowsPerPageChange={setInvRowsPerPage}
                                itemLabel="products"
                            />
                        </>
                    )}
                </div>
            )}

            {/* ==================== TAB 2B: SELLERS MANAGEMENT ==================== */}
            {activeTab === 'sellers' && (
                <div className={styles['section-card']}>
                    <div className={styles['seller-summary-grid']}>
                        <div className={styles['seller-stat-box']}>
                            <small>Total Registered Sellers</small>
                            <strong>{sellers.length}</strong>
                        </div>
                        <div className={styles['seller-stat-box']}>
                            <small>Pending Admin Approval</small>
                            <strong style={{color: '#d97706'}}>
                                {
                                    sellers.filter(
                                        (s) => (s.seller_profile?.status || 'PENDING') === 'PENDING'
                                    ).length
                                }
                            </strong>
                        </div>
                        <div className={styles['seller-stat-box']}>
                            <small>Approved Active Stores</small>
                            <strong style={{color: '#059669'}}>
                                {
                                    sellers.filter((s) => s.seller_profile?.status === 'APPROVED')
                                        .length
                                }
                            </strong>
                        </div>
                        <div className={styles['seller-stat-box']}>
                            <small>Combined Seller Earnings</small>
                            <strong style={{color: '#0f172a'}}>
                                {formatKES(
                                    sellers.reduce(
                                        (sum, s) => sum + Number(s.stats?.total_earnings || 0),
                                        0
                                    )
                                )}{' '}
                                KES
                            </strong>
                        </div>
                    </div>

                    <div className={styles['toolbar']}>
                        <div className={styles['search-box']}>
                            <span className="material-symbols-outlined">store</span>
                            <input
                                type="text"
                                value={sellerSearch}
                                onChange={(e) => {
                                    setSellerSearch(e.target.value);
                                    setSellerPage(1);
                                }}
                                placeholder="Search sellers by store name, owner, email, or location..."
                            />
                        </div>

                        <select
                            value={sellerStatusFilter}
                            onChange={(e) => {
                                setSellerStatusFilter(e.target.value);
                                setSellerPage(1);
                            }}
                            className={styles['select-input']}
                        >
                            <option value="ALL">All Statuses ({sellers.length})</option>
                            <option value="PENDING">
                                Pending Approval (
                                {
                                    sellers.filter(
                                        (s) => (s.seller_profile?.status || 'PENDING') === 'PENDING'
                                    ).length
                                }
                                )
                            </option>
                            <option value="APPROVED">Approved Stores</option>
                            <option value="REJECTED">Rejected</option>
                            <option value="SUSPENDED">Suspended</option>
                        </select>

                        <div className={styles['toolbar-right']}>
                            <a
                                href="/seller"
                                target="_blank"
                                rel="noopener noreferrer"
                                className={styles['btn-emerald']}
                            >
                                <span className="material-symbols-outlined">open_in_new</span>
                                <span>Open Seller Portal ↗</span>
                            </a>
                        </div>
                    </div>

                    {loadingSellers ? (
                        <Loading/>
                    ) : filteredSellers.length === 0 ? (
                        <div className={styles['empty-sellers']}>
                            <span className="material-symbols-outlined">storefront</span>
                            <h3>No seller accounts found</h3>
                            <p>
                                When sellers register in the Seller Portal, their approval requests
                                and store metrics will appear right here.
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className={styles['table-wrap']}>
                                <table className={styles['modern-table']}>
                                    <thead>
                                        <tr>
                                            <th>Store & Owner</th>
                                            <th>Approval Status</th>
                                            <th>Products</th>
                                            <th>Orders / Sold / Returned</th>
                                            <th>Earnings (KES)</th>
                                            <th>Rating</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedSellers.map((s) => {
                                            const prof = s.seller_profile || {};
                                            const st = prof.status || 'PENDING';
                                            const stats = s.stats || {};
                                            const stClass =
                                                st === 'APPROVED'
                                                    ? styles['seller-st-approved']
                                                    : st === 'PENDING'
                                                    ? styles['seller-st-pending']
                                                    : styles['seller-st-blocked'];

                                            return (
                                                <tr key={s._id}>
                                                    <td>
                                                        <div className={styles['seller-cell']}>
                                                            <strong>
                                                                {prof.store_name ||
                                                                    `${s.first_name} ${s.last_name}`}
                                                            </strong>
                                                            <small>
                                                                {s.first_name} {s.last_name} •{' '}
                                                                {s.email}
                                                            </small>
                                                            <small>
                                                                📍{' '}
                                                                {prof.business_location ||
                                                                    'Nairobi, Kenya'}
                                                                {prof.business_phone
                                                                    ? ` • 📞 ${prof.business_phone}`
                                                                    : ''}
                                                            </small>
                                                            {prof.category_focus && (
                                                                <span
                                                                    className={styles['cat-chip']}
                                                                    style={{
                                                                        marginTop: '0.2rem',
                                                                        display: 'inline-block',
                                                                    }}
                                                                >
                                                                    {prof.category_focus}
                                                                </span>
                                                            )}
                                                            {prof.rejection_reason &&
                                                                (st === 'REJECTED' ||
                                                                    st === 'SUSPENDED') && (
                                                                    <div
                                                                        className={
                                                                            styles['seller-reason']
                                                                        }
                                                                    >
                                                                        Note: {prof.rejection_reason}
                                                                    </div>
                                                                )}
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span
                                                            className={`${styles['seller-st-pill']} ${stClass}`}
                                                        >
                                                            {st}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <strong>{stats.products_count || 0}</strong>{' '}
                                                        listed
                                                    </td>
                                                    <td>
                                                        <div className={styles['seller-metrics']}>
                                                            <span>
                                                                <b>{stats.orders_count || 0}</b>{' '}
                                                                orders
                                                            </span>
                                                            <span>
                                                                <b>{stats.units_sold || 0}</b> sold
                                                            </span>
                                                            <span
                                                                style={{
                                                                    color:
                                                                        (stats.returned_units || 0) >
                                                                        0
                                                                            ? '#dc2626'
                                                                            : '#64748b',
                                                                }}
                                                            >
                                                                <b>{stats.returned_units || 0}</b>{' '}
                                                                returned
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <strong style={{color: '#059669'}}>
                                                            {formatKES(stats.total_earnings || 0)}{' '}
                                                            KES
                                                        </strong>
                                                    </td>
                                                    <td>
                                                        {stats.reviews_count > 0 ? (
                                                            <span className={styles['rating-pill']}>
                                                                ★ {stats.seller_rating} (
                                                                {stats.reviews_count})
                                                            </span>
                                                        ) : (
                                                            <span className={styles['muted']}>
                                                                No ratings
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <div className={styles['row-actions']}>
                                                            {st !== 'APPROVED' && (
                                                                <IconActionButton
                                                                    icon="verified"
                                                                    label={
                                                                        st === 'PENDING'
                                                                            ? 'Approve Seller'
                                                                            : 'Reactivate Seller'
                                                                    }
                                                                    tone="emerald"
                                                                    disabled={
                                                                        updatingSellerId === s._id
                                                                    }
                                                                    onClick={() =>
                                                                        handleUpdateSellerStatus(
                                                                            s,
                                                                            'APPROVED'
                                                                        )
                                                                    }
                                                                />
                                                            )}
                                                            {st === 'PENDING' && (
                                                                <IconActionButton
                                                                    icon="block"
                                                                    label="Reject Seller Application"
                                                                    tone="danger"
                                                                    disabled={
                                                                        updatingSellerId === s._id
                                                                    }
                                                                    onClick={() =>
                                                                        handleUpdateSellerStatus(
                                                                            s,
                                                                            'REJECTED'
                                                                        )
                                                                    }
                                                                />
                                                            )}
                                                            {st === 'APPROVED' && (
                                                                <IconActionButton
                                                                    icon="pause_circle"
                                                                    label="Suspend Seller Store"
                                                                    tone="danger"
                                                                    disabled={
                                                                        updatingSellerId === s._id
                                                                    }
                                                                    onClick={() =>
                                                                        handleUpdateSellerStatus(
                                                                            s,
                                                                            'SUSPENDED'
                                                                        )
                                                                    }
                                                                />
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            <TablePagination
                                totalItems={filteredSellers.length}
                                currentPage={sellerPage}
                                rowsPerPage={sellerRowsPerPage}
                                onPageChange={setSellerPage}
                                onRowsPerPageChange={setSellerRowsPerPage}
                                itemLabel="sellers"
                            />
                        </>
                    )}
                </div>
            )}

            {/* ==================== TAB 3: USER MANAGEMENT ==================== */}
            {activeTab === 'users' && (
                <div className={styles['section-card']}>
                    <div className={styles['toolbar']}>
                        <div className={styles['search-box']}>
                            <span className="material-symbols-outlined">person_search</span>
                            <input
                                type="text"
                                value={userSearch}
                                onChange={(e) => {
                                    setUserSearch(e.target.value);
                                    setUserPage(1);
                                }}
                                placeholder="Search users by name or email..."
                            />
                        </div>

                        <select
                            value={userRoleFilter}
                            onChange={(e) => {
                                setUserRoleFilter(e.target.value);
                                setUserPage(1);
                            }}
                            className={styles['select-input']}
                        >
                            <option value="ALL">All Roles ({users.length})</option>
                            <option value="ADMIN">Admins Only</option>
                            <option value="SELLER">Sellers Only</option>
                            <option value="USER">Customers Only</option>
                        </select>
                    </div>

                    {loadingUsers ? (
                        <Loading/>
                    ) : (
                        <>
                            <div className={styles['table-wrap']}>
                                <table className={styles['modern-table']}>
                                    <thead>
                                        <tr>
                                            <th>User Account</th>
                                            <th>Role</th>
                                            <th>Orders</th>
                                            <th>Lifetime Spend</th>
                                            <th>Active Cart</th>
                                            <th>Wishlist</th>
                                            <th>Manage</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedUsers.map((u) => (
                                            <tr key={u._id}>
                                                <td>
                                                    <div className={styles['user-cell']}>
                                                        <div className={styles['user-avatar']}>
                                                            {u.avatar ? (
                                                                <img
                                                                    src={u.avatar}
                                                                    alt={u.first_name || 'User'}
                                                                    style={{
                                                                        width: '100%',
                                                                        height: '100%',
                                                                        objectFit: 'cover',
                                                                        borderRadius: '50%',
                                                                    }}
                                                                />
                                                            ) : (
                                                                (u.first_name || u.email || 'U')
                                                                    .charAt(0)
                                                                    .toUpperCase()
                                                            )}
                                                        </div>
                                                        <div>
                                                            <strong>
                                                                {u.first_name} {u.last_name}
                                                            </strong>
                                                            <small>{u.email}</small>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td>
                                                    <span
                                                        className={
                                                            u.role === 'ADMIN'
                                                                ? styles['role-admin']
                                                                : u.role === 'SELLER'
                                                                ? styles['role-seller']
                                                                : styles['role-user']
                                                        }
                                                    >
                                                        {u.role}
                                                    </span>
                                                </td>
                                                <td>
                                                    <strong>{u.orders_count || 0}</strong> orders
                                                </td>
                                                <td>
                                                    <strong>
                                                        {formatKES(u.total_spent || 0)} KES
                                                    </strong>
                                                </td>
                                                <td>{u.cart_count || 0} items</td>
                                                <td>{u.wishlist_count || 0} saved</td>
                                                <td>
                                                    <div className={styles['row-actions']}>
                                                        <IconActionButton
                                                            icon={
                                                                u.role === 'ADMIN'
                                                                    ? 'person_remove'
                                                                    : 'admin_panel_settings'
                                                            }
                                                            label={
                                                                u.role === 'ADMIN'
                                                                    ? 'Set as Customer'
                                                                    : 'Promote to Admin'
                                                            }
                                                            tone={u.role === 'ADMIN' ? 'amber' : 'blue'}
                                                            disabled={updatingUserId === u._id}
                                                            onClick={() => handleToggleUserRole(u)}
                                                        />
                                                        <IconActionButton
                                                            icon="person_off"
                                                            label="Suspend & Move to GDPR Trash"
                                                            tone="danger"
                                                            disabled={updatingUserId === u._id}
                                                            onClick={() => handleDeleteUser(u)}
                                                        />
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <TablePagination
                                totalItems={filteredUsers.length}
                                currentPage={userPage}
                                rowsPerPage={userRowsPerPage}
                                onPageChange={setUserPage}
                                onRowsPerPageChange={setUserRowsPerPage}
                                itemLabel="users"
                            />
                        </>
                    )}
                </div>
            )}

            {/* ==================== TAB 3B: TRASH BIN & GDPR RETENTION ==================== */}
            {activeTab === 'trash' && (
                <div className={styles['section-card']}>
                    {/* Automated Trash & GDPR Cleanup Status Bar */}
                    <div className={styles['cron-status-bar']}>
                        <div className={styles['cron-status-info']}>
                            <span className={styles['cron-dot']}/>
                            <span>
                                <strong>Automated Retention Cleanup:</strong> Runs daily at 2:00 AM
                                • Products: <strong>{trashRetention.product_days}d</strong>{' '}
                                auto-delete • Users (GDPR):{' '}
                                <strong>{trashRetention.user_gdpr_days}d</strong> statutory hold •
                                Last sweep:{' '}
                                <strong>
                                    {trashCronStatus.last_run_at
                                        ? formatDateTime(trashCronStatus.last_run_at)
                                        : 'Active'}
                                </strong>
                            </span>
                        </div>
                        <button
                            type="button"
                            disabled={runningTrashCron}
                            onClick={handleRunTrashCronNow}
                            className={styles['cron-run-btn']}
                        >
                            <span className="material-symbols-outlined">cleaning_services</span>
                            <span>
                                {runningTrashCron ? 'Running Cleanup...' : 'Run Cleanup Sweep Now'}
                            </span>
                        </button>
                    </div>

                    {/* Retention Policy Cards */}
                    <div className={styles['trash-policy-grid']}>
                        <div className={styles['trash-policy-card']}>
                            <div className={styles['trash-policy-icon-amber']}>
                                <span className="material-symbols-outlined">inventory_2</span>
                            </div>
                            <div>
                                <strong>
                                    Trashed Products ({trashedProducts.length}) —{' '}
                                    {trashRetention.product_days}-Day Retention
                                </strong>
                                <p>
                                    Deleted products are hidden from customers and held in Trash for{' '}
                                    {trashRetention.product_days} days. Restore anytime before
                                    automated daily cleanup permanently deletes them.
                                </p>
                            </div>
                        </div>

                        <div className={styles['trash-policy-card']}>
                            <div className={styles['trash-policy-icon-blue']}>
                                <span className="material-symbols-outlined">shield_lock</span>
                            </div>
                            <div>
                                <strong>
                                    Suspended Users ({trashedUsers.length}) —{' '}
                                    {trashRetention.user_gdpr_days}-Day GDPR Retention
                                </strong>
                                <p>
                                    Accounts suspended by Admin or by the user are archived under
                                    GDPR Art. 17(3)(b) for statutory tax, order, and audit
                                    obligations ({trashRetention.user_gdpr_days} days) before
                                    automated personal data erasure.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Sub-tabs & Search Toolbar */}
                    <div className={styles['toolbar']}>
                        <div className={styles['trash-subtabs']}>
                            <button
                                type="button"
                                onClick={() => {
                                    setTrashSubTab('products');
                                    setTrashPage(1);
                                }}
                                className={`${styles['trash-subtab']} ${
                                    trashSubTab === 'products' ? styles['trash-subtab-active'] : ''
                                }`}
                            >
                                <span className="material-symbols-outlined">inventory_2</span>
                                <span>Trashed Products ({trashedProducts.length})</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setTrashSubTab('users');
                                    setTrashPage(1);
                                }}
                                className={`${styles['trash-subtab']} ${
                                    trashSubTab === 'users' ? styles['trash-subtab-active'] : ''
                                }`}
                            >
                                <span className="material-symbols-outlined">person_off</span>
                                <span>Suspended Users · GDPR ({trashedUsers.length})</span>
                            </button>
                        </div>

                        <div className={styles['search-box']}>
                            <span className="material-symbols-outlined">search</span>
                            <input
                                type="text"
                                value={trashSearch}
                                onChange={(e) => {
                                    setTrashSearch(e.target.value);
                                    setTrashPage(1);
                                }}
                                placeholder={
                                    trashSubTab === 'products'
                                        ? 'Search trashed products by name, ID, category, or reason...'
                                        : 'Search suspended users by name, email, or suspension reason...'
                                }
                            />
                        </div>
                    </div>

                    {loadingTrash ? (
                        <Loading/>
                    ) : activeTrashList.length === 0 ? (
                        <div className={styles['empty-sellers']}>
                            <span className="material-symbols-outlined">
                                {trashSubTab === 'products' ? 'delete_sweep' : 'verified_user'}
                            </span>
                            <h3>
                                {trashSubTab === 'products'
                                    ? 'Product Trash is empty'
                                    : 'No suspended user accounts in GDPR archive'}
                            </h3>
                            <p>
                                {trashSubTab === 'products'
                                    ? `Deleted products stay here for ${trashRetention.product_days} days so you can restore them anytime.`
                                    : `Suspended user accounts are archived here for ${trashRetention.user_gdpr_days} days under GDPR compliance.`}
                            </p>
                        </div>
                    ) : trashSubTab === 'products' ? (
                        <>
                            <div className={styles['table-wrap']}>
                                <table className={styles['modern-table']}>
                                    <thead>
                                        <tr>
                                            <th>Product</th>
                                            <th>Category & Price</th>
                                            <th>Deleted By & Reason</th>
                                            <th>Auto-Delete Countdown</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedTrash.map((prod) => (
                                            <tr key={prod.product_id}>
                                                <td>
                                                    <div className={styles['table-prod']}>
                                                        <img src={prod.image} alt={prod.name}/>
                                                        <div>
                                                            <strong>{prod.name}</strong>
                                                            <small>
                                                                #{prod.sku || String(prod.product_id).slice(0, 8)} •{' '}
                                                                {prod.weight}
                                                                {prod.measurement}
                                                            </small>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className={styles['cat-chip']}>
                                                        {prod.category}
                                                    </span>
                                                    <div style={{marginTop: '4px', fontWeight: 700}}>
                                                        {formatKES(prod.price)} KES
                                                    </div>
                                                </td>
                                                <td>
                                                    <div style={{fontSize: '12.5px'}}>
                                                        <strong>{prod.deleted_by || 'Admin'}</strong>
                                                        <div className={styles['muted']}>
                                                            {formatDateTime(prod.deleted_at)}
                                                        </div>
                                                        {prod.delete_reason && (
                                                            <div
                                                                style={{
                                                                    color: '#475569',
                                                                    marginTop: '2px',
                                                                    maxWidth: '240px',
                                                                }}
                                                            >
                                                                “{prod.delete_reason}”
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td>
                                                    <span
                                                        className={`${styles['retention-pill']} ${
                                                            (prod.days_remaining ?? 30) <= 5
                                                                ? styles['retention-urgent']
                                                                : styles['retention-warn']
                                                        }`}
                                                    >
                                                        ⏳ {prod.days_remaining ?? 30} day
                                                        {(prod.days_remaining ?? 30) === 1
                                                            ? ''
                                                            : 's'}{' '}
                                                        left
                                                    </span>
                                                    <small
                                                        style={{
                                                            display: 'block',
                                                            marginTop: '4px',
                                                            color: '#64748b',
                                                        }}
                                                    >
                                                        Purges {formatDateTime(prod.purge_after)}
                                                    </small>
                                                </td>
                                                <td>
                                                    <div className={styles['row-actions']}>
                                                        <IconActionButton
                                                            icon="visibility"
                                                            label="View Product Details"
                                                            tone="blue"
                                                            onClick={() => setViewingProduct(prod)}
                                                        />
                                                        <IconActionButton
                                                            icon="restore_from_trash"
                                                            label={
                                                                restoringKey ===
                                                                `prod-${prod.product_id}`
                                                                    ? 'Restoring Product...'
                                                                    : 'Restore to Inventory'
                                                            }
                                                            tone="emerald"
                                                            disabled={
                                                                restoringKey ===
                                                                `prod-${prod.product_id}`
                                                            }
                                                            onClick={() =>
                                                                handleRestoreProduct(prod)
                                                            }
                                                        />
                                                        <IconActionButton
                                                            icon="delete_forever"
                                                            label="Delete Permanently"
                                                            tone="danger"
                                                            onClick={() =>
                                                                openPermanentDeleteProductConfirm(
                                                                    prod
                                                                )
                                                            }
                                                        />
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <TablePagination
                                totalItems={filteredTrashedProducts.length}
                                currentPage={trashPage}
                                rowsPerPage={trashRowsPerPage}
                                onPageChange={setTrashPage}
                                onRowsPerPageChange={setTrashRowsPerPage}
                                itemLabel="trashed products"
                            />
                        </>
                    ) : (
                        <>
                            <div className={styles['table-wrap']}>
                                <table className={styles['modern-table']}>
                                    <thead>
                                        <tr>
                                            <th>Suspended User</th>
                                            <th>Role</th>
                                            <th>Suspended By & Reason</th>
                                            <th>GDPR Retention Hold</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedTrash.map((u) => (
                                            <tr key={u._id}>
                                                <td>
                                                    <div className={styles['user-cell']}>
                                                        <div className={styles['user-avatar']}>
                                                            {u.avatar ? (
                                                                <img
                                                                    src={u.avatar}
                                                                    alt={u.first_name || 'User'}
                                                                    style={{
                                                                        width: '100%',
                                                                        height: '100%',
                                                                        objectFit: 'cover',
                                                                        borderRadius: '50%',
                                                                    }}
                                                                />
                                                            ) : (
                                                                (u.first_name || u.email || 'U')
                                                                    .charAt(0)
                                                                    .toUpperCase()
                                                            )}
                                                        </div>
                                                        <div>
                                                            <strong>
                                                                {u.first_name} {u.last_name}
                                                            </strong>
                                                            <small>{u.email}</small>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td>
                                                    <span
                                                        className={
                                                            u.role === 'ADMIN'
                                                                ? styles['role-admin']
                                                                : u.role === 'SELLER'
                                                                ? styles['role-seller']
                                                                : styles['role-user']
                                                        }
                                                    >
                                                        {u.role || 'USER'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div style={{fontSize: '12.5px'}}>
                                                        <strong>
                                                            {u.deleted_by === 'SELF'
                                                                ? 'Self-Suspended by User'
                                                                : u.deleted_by || 'Admin'}
                                                        </strong>
                                                        <div className={styles['muted']}>
                                                            {formatDateTime(u.deleted_at)}
                                                        </div>
                                                        {u.suspension_reason && (
                                                            <div
                                                                style={{
                                                                    color: '#475569',
                                                                    marginTop: '2px',
                                                                    maxWidth: '250px',
                                                                }}
                                                            >
                                                                “{u.suspension_reason}”
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td>
                                                    <span
                                                        className={`${styles['retention-pill']} ${styles['retention-gdpr']}`}
                                                    >
                                                        🛡️ {u.days_remaining ?? 365} days GDPR hold
                                                    </span>
                                                    <small
                                                        style={{
                                                            display: 'block',
                                                            marginTop: '4px',
                                                            color: '#64748b',
                                                        }}
                                                    >
                                                        Retained until{' '}
                                                        {formatDateTime(u.gdpr_retain_until)}
                                                    </small>
                                                </td>
                                                <td>
                                                    <div className={styles['row-actions']}>
                                                        <IconActionButton
                                                            icon="settings_backup_restore"
                                                            label={
                                                                restoringKey === `user-${u._id}`
                                                                    ? 'Restoring Account...'
                                                                    : 'Restore User Account'
                                                            }
                                                            tone="emerald"
                                                            disabled={
                                                                restoringKey === `user-${u._id}`
                                                            }
                                                            onClick={() => handleRestoreUser(u)}
                                                        />
                                                        <IconActionButton
                                                            icon="gpp_maybe"
                                                            label="GDPR Erase Permanently"
                                                            tone="danger"
                                                            onClick={() =>
                                                                openPermanentEraseUserConfirm(u)
                                                            }
                                                        />
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <TablePagination
                                totalItems={filteredTrashedUsers.length}
                                currentPage={trashPage}
                                rowsPerPage={trashRowsPerPage}
                                onPageChange={setTrashPage}
                                onRowsPerPageChange={setTrashRowsPerPage}
                                itemLabel="suspended users"
                            />
                        </>
                    )}
                </div>
            )}

            {/* ==================== TAB 4: AUDIT & ACTIVITY LOGS ==================== */}
            {activeTab === 'logs' && (
                <div className={styles['logs-layout']}>
                    <div className={styles['section-card']}>
                        <div className={styles['toolbar']}>
                            <select
                                value={logCategory}
                                onChange={(e) => {
                                    setLogCategory(e.target.value);
                                    setLogPage(1);
                                }}
                                className={styles['select-input']}
                            >
                                <option value="ALL">All Categories</option>
                                <option value="ORDERS">Orders</option>
                                <option value="SHIPPING">Shipping & Dispatch</option>
                                <option value="INVENTORY">Inventory & Products</option>
                                <option value="SELLERS">Sellers & Approvals</option>
                                <option value="USERS">Users & Security</option>
                                <option value="TRASH">Trash & GDPR Retention</option>
                                <option value="SYSTEM">System & ACID Engine</option>
                            </select>

                            <select
                                value={logSeverity}
                                onChange={(e) => {
                                    setLogSeverity(e.target.value);
                                    setLogPage(1);
                                }}
                                className={styles['select-input']}
                            >
                                <option value="ALL">All Severities</option>
                                <option value="INFO">Info</option>
                                <option value="SUCCESS">Success</option>
                                <option value="WARNING">Warning</option>
                                <option value="DANGER">Danger / Critical</option>
                            </select>
                        </div>

                        {loadingLogs ? (
                            <Loading/>
                        ) : (
                            <>
                                <div className={styles['logs-stream']}>
                                    {paginatedLogs.map((log) => (
                                        <div
                                            key={log.log_id || log._id}
                                            className={styles['log-item']}
                                        >
                                            <span
                                                className={`${styles['sev-badge']} ${
                                                    styles[
                                                        `sev-${String(
                                                            log.severity || 'INFO'
                                                        ).toLowerCase()}`
                                                    ]
                                                }`}
                                            >
                                                {log.severity || 'INFO'}
                                            </span>

                                            <div className={styles['log-main']}>
                                                <div className={styles['log-head']}>
                                                    <strong>{log.action}</strong>
                                                    <span className={styles['log-cat']}>
                                                        {log.category}
                                                    </span>
                                                    {log.target_id && (
                                                        <span className={styles['log-target']}>
                                                            #{log.target_id}
                                                        </span>
                                                    )}
                                                </div>
                                                <p>{log.details}</p>
                                                <small>
                                                    By {log.actor_name} ({log.actor_email}) •{' '}
                                                    {formatDateTime(log.created_at)}
                                                </small>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <TablePagination
                                    totalItems={logs.length}
                                    currentPage={logPage}
                                    rowsPerPage={logRowsPerPage}
                                    onPageChange={setLogPage}
                                    onRowsPerPageChange={setLogRowsPerPage}
                                    itemLabel="audit logs"
                                />
                            </>
                        )}
                    </div>

                    {/* Right Card: Log Operational Shift Note */}
                    <aside className={styles['section-card']}>
                        <h3>Record Operational Log Entry</h3>
                        <p className={styles['muted-p']}>
                            Add a manual shift note, inventory audit memo, or dispatch incident to the permanent audit log.
                        </p>

                        <form onSubmit={handleAddAuditNote} className={styles['note-form']}>
                            <label>Category</label>
                            <select
                                value={noteCategory}
                                onChange={(e) => setNoteCategory(e.target.value)}
                                className={styles['select-input']}
                            >
                                <option value="SYSTEM">System</option>
                                <option value="INVENTORY">Inventory</option>
                                <option value="ORDERS">Orders</option>
                                <option value="SHIPPING">Shipping</option>
                                <option value="SELLERS">Sellers</option>
                                <option value="USERS">Users</option>
                            </select>

                            <label>Severity</label>
                            <select
                                value={noteSeverity}
                                onChange={(e) => setNoteSeverity(e.target.value)}
                                className={styles['select-input']}
                            >
                                <option value="INFO">Info</option>
                                <option value="SUCCESS">Success</option>
                                <option value="WARNING">Warning</option>
                                <option value="DANGER">Critical</option>
                            </select>

                            <label>Audit Note Details</label>
                            <textarea
                                rows={4}
                                value={noteDetails}
                                onChange={(e) => setNoteDetails(e.target.value)}
                                placeholder="Describe the operational event or audit check..."
                            />

                            <button type="submit" className={styles['btn-emerald']}>
                                <span className="material-symbols-outlined">add_task</span>
                                <span>Record Audit Entry</span>
                            </button>
                        </form>
                    </aside>
                </div>
            )}
            {/* Full Product Preview Modal (Designed like Product Details page) */}
            <AdminProductViewModal
                product={viewingProduct}
                isOpen={Boolean(viewingProduct)}
                onClose={() => setViewingProduct(null)}
                onFullEdit={(prod) => {
                    setViewingProduct(null);
                    navigate(`/admin/products/edit/${prod.product_id}`);
                }}
                onMoveToTrash={(prod) => openTrashProductConfirm(prod)}
                onRestore={(prod) => handleRestoreProduct(prod)}
                onApprovePublish={(prod) => {
                    handleUpdateProductApproval(prod, 'APPROVED');
                    setViewingProduct(null);
                }}
                onReviewPendingEdits={(prod, action) => {
                    handleReviewProductEdits(prod, action);
                    setViewingProduct(null);
                }}
            />

            {/* Reusable Confirmation Modal for Trash / GDPR Suspend / Permanent Deletion */}
            <ConfirmActionModal
                isOpen={Boolean(confirmConfig)}
                onClose={() => !confirmBusy && setConfirmConfig(null)}
                onConfirm={handleConfirmModalSubmit}
                title={confirmConfig?.title}
                subtitle={confirmConfig?.subtitle}
                description={confirmConfig?.description}
                policyTitle={confirmConfig?.policyTitle}
                policyPoints={confirmConfig?.policyPoints || []}
                variant={confirmConfig?.variant || 'danger'}
                icon={confirmConfig?.icon || 'warning'}
                confirmLabel={confirmConfig?.confirmLabel || 'Confirm'}
                showReasonInput={Boolean(confirmConfig?.showReasonInput)}
                reasonLabel={confirmConfig?.reasonLabel}
                reasonPlaceholder={confirmConfig?.reasonPlaceholder}
                loading={confirmBusy}
                error={confirmError}
            />
        </AdminLayout>
    );
};

export default Admin;
