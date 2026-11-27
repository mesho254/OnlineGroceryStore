import {Link, useNavigate, useSearchParams} from "react-router-dom";
import Loading from "../../components/loading/Loading";
import {useEffect} from "react";
import {useDispatch} from "react-redux";
import {useQuery} from "@tanstack/react-query";
import * as api from "../../api";
import {ORDERS_FETCH} from "../../constants/actions/orders";
import {queryClient} from "../../index";

const Success = ({setCart}) => {
    const [searchParams] = useSearchParams();
    const order_id = searchParams.get('order');
    const session_id = searchParams.get('session_id');
    const navigate = useNavigate();
    const dispatch = useDispatch();

    const {data: orderData, isError, error} = useQuery({
        queryKey: ['orderSuccessVerify', order_id, session_id],
        queryFn: async () => {
            if (session_id) {
                await api.verifyCheckoutSession(session_id);
            }
            const res = await api.fetchOrder(order_id);
            dispatch({type: ORDERS_FETCH, data: res.data});
            return res.data;
        },
        enabled: Boolean(order_id || session_id),
        retry: (failureCount, err) => {
            // Do not keep retrying if payment was not completed (402) or item sold out (409)
            const status = err?.response?.status;
            if (status === 402 || status === 409) return false;
            return failureCount < 2;
        },
        retryDelay: 1000,
        staleTime: 0
    });

    useEffect(() => {
        if (orderData) {
            setCart([]);
            queryClient.invalidateQueries({queryKey: ['products']});
            queryClient.invalidateQueries({queryKey: ['product']});
            queryClient.invalidateQueries({queryKey: ['recommendations']});
            queryClient.invalidateQueries({queryKey: ['flashSales']});
            queryClient.invalidateQueries({queryKey: ['notifications']});
            navigate(`/orders/${orderData.order_id || order_id}`, {replace: true});
        }
    }, [orderData, navigate, order_id, setCart]);

    useEffect(() => {
        if (isError && error?.response?.status === 402) {
            navigate('/cart', {replace: true});
        }
    }, [isError, error, navigate]);

    if (isError && error?.response?.status !== 402) {
        const errData = error?.response?.data || {};
        const isOutOfStockRace =
            error?.response?.status === 409 ||
            errData.code === 'OUT_OF_STOCK' ||
            errData.code === 'OUT_OF_STOCK_REFUNDED';

        return (
            <div
                style={{
                    maxWidth: '580px',
                    margin: '4rem auto',
                    padding: '2.25rem',
                    background: '#ffffff',
                    border: '1px solid #fecaca',
                    borderRadius: '24px',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '1rem',
                    boxShadow: '0 16px 36px -14px rgba(15, 23, 42, 0.08)',
                }}
            >
                <div
                    style={{
                        width: '62px',
                        height: '62px',
                        borderRadius: '18px',
                        background: '#fef2f2',
                        color: '#dc2626',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <span className="material-symbols-outlined" style={{fontSize: '2rem'}}>
                        {isOutOfStockRace ? 'inventory_2' : 'error_outline'}
                    </span>
                </div>
                <h2 style={{fontSize: '1.35rem', fontWeight: 800, color: '#0f172a'}}>
                    {errData.refunded
                        ? 'Item Sold Out — Automatic Refund Issued'
                        : isOutOfStockRace
                        ? 'Item Just Sold Out'
                        : 'Could Not Confirm Order'}
                </h2>
                <p style={{fontSize: '0.9rem', color: '#475569', lineHeight: 1.55}}>
                    {errData.message ||
                        error?.message ||
                        'We could not complete your order confirmation. Please return to your cart.'}
                </p>
                <div style={{display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.5rem'}}>
                    <Link to="/cart" className="btn1">
                        <span>Return to Cart</span>
                        <span className="material-symbols-outlined">shopping_cart</span>
                    </Link>
                    <Link
                        to="/products"
                        style={{
                            padding: '0.65rem 1.15rem',
                            borderRadius: '12px',
                            border: '1px solid #cbd5e1',
                            color: '#334155',
                            fontWeight: 700,
                            fontSize: '0.86rem',
                        }}
                    >
                        Browse Products
                    </Link>
                </div>
            </div>
        );
    }

    return <Loading text={'Verifying Payment & Confirming Order'}/>;
};

export default Success;
