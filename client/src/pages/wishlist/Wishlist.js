import styles from './wishlist.module.css';
import {useState, useEffect} from "react";
import {Link} from "react-router-dom";
import {useQuery} from "@tanstack/react-query";
import * as api from "../../api";
import Loading from "../../components/loading/Loading";
import ProductCard from "../../components/product-card/ProductCard";
import Error from "../../components/feedback/error/Error";

const Wishlist = ({addProductToCart}) => {
    const [error, setError] = useState('');

    const {data: products = [], isPending, error: queryError} = useQuery({
        queryKey: ['wishlist'],
        queryFn: async () => {
            const res = await api.getWishlist();
            return res.data || [];
        },
        staleTime: 0,
        refetchOnMount: 'always',
        refetchOnWindowFocus: true
    });

    useEffect(() => {
        if (queryError) {
            setError(queryError?.response?.data?.message || queryError.message);
        }
    }, [queryError]);

    if (isPending)
        return <Loading/>;

    return (
        <div className={styles['wrapper']}>
            {error && <Error error={error} setError={setError}/>}

            <div className={styles['page-head']}>
                <div>
                    <span className={styles['eyebrow']}>SAVED FAVORITES</span>
                    <h1 className={styles['page-title']}>
                        My Wishlist {products?.length > 0 ? `(${products.length})` : ''}
                    </h1>
                </div>
                <Link to={'/products'} className={styles['explore-link']}>
                    Explore All Aisles →
                </Link>
            </div>

            {!products?.length ? (
                <div className={styles['no-products']}>
                    <div className={styles['heart-badge']}>
                        <span className="material-symbols-outlined">favorite</span>
                    </div>
                    <h2>No saved favorites yet</h2>
                    <p>
                        Tap the heart icon on any product card to save your favorite groceries for quick reordering.
                    </p>
                    <Link to={'/products'} className={'btn1'}>
                        <span>Explore Fresh Products</span>
                        <span className="material-symbols-outlined">arrow_forward</span>
                    </Link>
                </div>
            ) : (
                <div className={styles['products-wrapper']}>
                    {products.map((product, i) => (
                        <ProductCard
                            product={product}
                            addProductToCart={addProductToCart}
                            key={product.product_id || i}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default Wishlist;
