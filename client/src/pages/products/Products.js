import styles from './products.module.css';
import {useEffect, useRef} from "react";
import {Link, useLocation} from "react-router-dom";
import {useInfiniteQuery} from "@tanstack/react-query";
import * as api from "../../api";
import ProductCard from "../../components/product-card/ProductCard";
import Categories from "../../components/categories/Categories";
import Loading from "../../components/loading/Loading";
import {
    formatRemainingTime,
    getSoonestFlashSaleEndMs,
    useLiveClock,
} from "../../utils/flashCountdown";

const Products = ({addProductToCart}) => {
    const location = useLocation();
    const loadMoreRef = useRef(null);

    const query = new URLSearchParams(location.search);
    const search = query.get('search') || null;
    const rawCategory = query.get('category');
    const category = rawCategory && rawCategory !== 'All' ? rawCategory : null;
    const isFlashOnly = query.get('flash') === 'true';

    const {
        data,
        isPending,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage
    } = useInfiniteQuery({
        queryKey: ['products', {category, search, flash: isFlashOnly}],
        queryFn: async ({pageParam = 1}) => {
            if (search) {
                const res = await api.productsSearch(search, pageParam);
                return {...res.data, currentPage: pageParam};
            }
            const res = await api.getProductsPerPage(pageParam, category, isFlashOnly);
            return {...res.data, currentPage: pageParam};
        },
        initialPageParam: 1,
        getNextPageParam: (lastPage) => {
            const totalPages = Number(lastPage?.total_pages || 0);
            const nextPage = Number(lastPage?.currentPage || 1) + 1;
            return nextPage <= totalPages ? nextPage : undefined;
        },
        staleTime: 2 * 60 * 1000,
        placeholderData: (previousData) => previousData,
    });

    useEffect(() => {
        const sentinel = loadMoreRef.current;
        if (!sentinel) return;

        const observer = new IntersectionObserver(
            (entries) => {
                const first = entries[0];
                if (first.isIntersecting && hasNextPage && !isFetchingNextPage) {
                    fetchNextPage();
                }
            },
            {rootMargin: '280px'}
        );

        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

    const products = data?.pages?.flatMap((pageData) => pageData?.products || []) || [];
    const nowMs = useLiveClock(isFlashOnly);

    // Show the soonest upcoming flash-sale end time across loaded deals in the top banner
    const soonestEndMs = isFlashOnly
        ? getSoonestFlashSaleEndMs(products, nowMs)
        : null;
    const bannerCountdown = soonestEndMs ? formatRemainingTime(soonestEndMs, nowMs) : null;

    const headingText = search
        ? `Search: "${search}"`
        : isFlashOnly
        ? category
            ? `⚡ Flash Sales — ${category}`
            : '⚡ Flash Sales & Discounts'
        : category || 'Products';

    const toggleFlashUrl = isFlashOnly
        ? category
            ? `/products?category=${encodeURIComponent(category)}`
            : '/products'
        : category
        ? `/products?category=${encodeURIComponent(category)}&flash=true`
        : '/products?flash=true';

    return (
        <div className={styles['wrapper']}>
            <div className={'heading'}>
                <h1>{headingText}</h1>
            </div>
            <Categories/>

            {!search && (
                <div className={styles['filter-strip']}>
                    {isFlashOnly ? (
                        <div className={styles['flash-active-banner']}>
                            <div className={styles['flash-banner-left']}>
                                <span>
                                    ⚡ Showing <strong>Flash Sales &amp; Discounted Products</strong>
                                    {category ? ` in ${category}` : ''}
                                </span>
                                {bannerCountdown && (
                                    <span className={styles['flash-banner-timer']}>
                                        <span className={styles['flash-banner-timer-lbl']}>
                                            Next deal ends in
                                        </span>
                                        <strong>
                                            {bannerCountdown.days > 0
                                                ? `${bannerCountdown.days}d `
                                                : ''}
                                            {bannerCountdown.hrs}h : {bannerCountdown.mins}m :{' '}
                                            {bannerCountdown.secs}s
                                        </strong>
                                    </span>
                                )}
                            </div>
                            <Link to={toggleFlashUrl} className={styles['clear-flash-btn']}>
                                Show All Products ✕
                            </Link>
                        </div>
                    ) : (
                        <Link to={toggleFlashUrl} className={styles['flash-filter-chip']}>
                            ⚡ Filter Flash Sales &amp; Discounts Only
                        </Link>
                    )}
                </div>
            )}
            {isPending ? (
                <Loading/>
            ) : (
                <>
                    <div className={styles['products-wrapper']}>
                        {products.map((product, i) => (
                            <ProductCard
                                addProductToCart={addProductToCart}
                                key={product.product_id || i}
                                product={product}
                                productsPage={true}
                                showFlashTimer={isFlashOnly || Boolean(product.flash_sale)}
                            />
                        ))}
                    </div>

                    <div ref={loadMoreRef} className={styles['infinite-sentinel']}>
                        {isFetchingNextPage && (
                            <div className={styles['loading-more']}>
                                <span className={styles['spinner']}/>
                                <span>Loading more fresh products...</span>
                            </div>
                        )}
                        {!hasNextPage && products.length > 0 && (
                            <div className={styles['end-badge']}>
                                ✓ Showing all {products.length} products
                            </div>
                        )}
                        {!isPending && products.length === 0 && (
                            <div className={styles['end-badge']}>
                                No products found matching your selection.
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default Products;
