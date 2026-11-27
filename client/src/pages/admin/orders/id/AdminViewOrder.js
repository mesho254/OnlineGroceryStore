import OrderSummary from "../../../../components/order-summary/OrderSummary";
import {useState} from "react";
import {Link, useParams} from "react-router-dom";
import {useDispatch} from "react-redux";
import {useQuery} from "@tanstack/react-query";
import * as api from "../../../../api";
import {ORDERS_FETCH} from "../../../../constants/actions/orders";
import AdminLayout from "../../../../components/admin-layout/AdminLayout";
import Loading from "../../../../components/loading/Loading";

const AdminViewOrder = () => {
    const {id} = useParams();
    const dispatch = useDispatch();
    const [downloadingPdf, setDownloadingPdf] = useState(false);

    const handleDownloadReceiptPdf = async () => {
        if (!id || downloadingPdf) return;
        setDownloadingPdf(true);
        try {
            const res = await api.downloadOrderReceiptPdf(id);
            const blob = new Blob([res.data], {type: 'application/pdf'});
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `FreshMart-Receipt-${id}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => window.URL.revokeObjectURL(url), 1000);
        } catch (err) {
            console.error('Receipt PDF download failed:', err);
        } finally {
            setDownloadingPdf(false);
        }
    };

    const {data: order, isPending} = useQuery({
        queryKey: ['order', id],
        queryFn: async () => {
            const res = await api.fetchOrder(id);
            dispatch({type: ORDERS_FETCH, data: res.data});
            return res.data;
        },
        enabled: Boolean(id),
        staleTime: 0,
        refetchOnMount: 'always',
        refetchOnWindowFocus: true,
    });

    return (
        <AdminLayout
            title={`Order #${id} Fulfillment Dossier`}
            subtitle="Complete customer contact profile, itemized financial receipt, pickup/doorstep logistics, and inline status controls."
            actions={
                <div style={{display: 'flex', gap: '0.6rem', flexWrap: 'wrap'}}>
                    <Link to="/admin/orders" className="btn2">
                        ← All Orders
                    </Link>
                    <button
                        type="button"
                        onClick={handleDownloadReceiptPdf}
                        disabled={downloadingPdf}
                        className="btn2"
                        style={{
                            background: '#0f172a',
                            color: '#ffffff',
                            borderColor: '#0f172a',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                        }}
                    >
                        <span className="material-symbols-outlined" style={{fontSize: '18px'}}>
                            receipt_long
                        </span>
                        <span>
                            {downloadingPdf ? 'Generating PDF...' : 'Download POS Receipt (PDF)'}
                        </span>
                    </button>
                    <Link to={`/shipping/${id}`} className="btn1">
                        <span>Live Shipment Tracker</span>
                        <span className="material-symbols-outlined">local_shipping</span>
                    </Link>
                </div>
            }
        >
            {isPending || !order ? (
                <Loading/>
            ) : (
                <OrderSummary order={order} allowAdminActions={true}/>
            )}
        </AdminLayout>
    );
};

export default AdminViewOrder;
