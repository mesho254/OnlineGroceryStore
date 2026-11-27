import styles from './home.module.css';
import {useState} from "react";
import {Link} from "react-router-dom";
import DeliveryImg from '../../shared/assets/delivery.png';
import Categories from "../../components/categories/Categories";
import ProductCard from "../../components/product-card/ProductCard";
import DeliveryIcon from '../../shared/assets/why/delivery.png';
import ReliableIcon from '../../shared/assets/why/reliable.png';
import PricesIcon from '../../shared/assets/why/prices.png';
import {motion} from 'framer-motion';
import {useDispatch, useSelector} from "react-redux";
import {useQuery} from "@tanstack/react-query";
import Loading from "../../components/loading/Loading";
import * as api from "../../api";
import {FETCH_RECOMMENDATIONS} from "../../constants/actions/products";
import {
    formatRemainingTime,
    getSoonestFlashSaleEndMs,
    useLiveClock,
} from "../../utils/flashCountdown";

const HOW_IT_WORKS = [
    {
        step: '01',
        icon: 'shopping_basket',
        title: 'Pick Fresh Aisles',
        desc: 'Browse highland greens, ripe fruits, dairy, prime meats, and pantry essentials sourced directly from verified Kenyan farms.',
    },
    {
        step: '02',
        icon: 'verified_user',
        title: 'Instant Checkout & Stock Lock',
        desc: 'Check out securely with real-time stock verification so your selected items are immediately reserved for your basket.',
    },
    {
        step: '03',
        icon: 'inventory_2',
        title: 'Quality-Checked & Packed',
        desc: 'Our dispatch hub inspects every item for peak freshness and packs chilled and dry groceries separately.',
    },
    {
        step: '04',
        icon: 'local_shipping',
        title: '20-Min Delivery & POS Receipt',
        desc: 'Track your rider live to your doorstep or Pickup Hub, and receive your downloadable POS PDF receipt upon delivery.',
    },
];

const TESTIMONIALS = [
    {
        name: 'Wanjiku M.',
        area: 'Kilimani, Nairobi',
        rating: 5,
        tag: 'Weekly Produce Buyer',
        quote: 'The sukuma wiki and Hass avocados arrived crisper than the morning market—literally 18 minutes after checkout, with a clean POS receipt in my email!',
    },
    {
        name: 'Brian O.',
        area: 'Westlands, Nairobi',
        rating: 5,
        tag: 'Pickup Station Regular',
        quote: 'I order on my way from work and grab my chilled groceries at the Westlands Pickup Hub for free. Live status notifications keep me posted every step.',
    },
    {
        name: 'Amina H.',
        area: 'Lavington, Nairobi',
        rating: 5,
        tag: 'Family Pantry Shopper',
        quote: 'Flash sales save our household thousands of shillings every month, and every seller rating is backed by verified delivered orders.',
    },
];

const FAQ_ITEMS = [
    {
        q: 'How fast is FreshMart express doorstep delivery?',
        a: 'Orders placed within our active Nairobi coverage zones are handpicked, packed, and dispatched within minutes—arriving at your doorstep in under 20 minutes on average, with live step-by-step shipment tracking.',
    },
    {
        q: 'Can I collect my order from a Pickup Station instead?',
        a: 'Yes! At checkout you can choose any convenient FreshMart Pickup Station across Nairobi for FREE collection. We notify you by email and in-app alert the moment your order is ready for pickup.',
    },
    {
        q: 'Do I get an official receipt for my grocery orders?',
        a: 'Every confirmed order includes a thermal POS-style PDF receipt complete with itemized prices, VAT breakdown, and order barcode. You can download it anytime from your Order Receipt page, and it is also attached automatically to your Delivered email.',
    },
    {
        q: 'How do you guarantee produce freshness?',
        a: 'All produce is harvested daily by verified farm partners and checked before dispatch. Every product page displays harvest dates, shelf life, storage tips, and verified buyer ratings.',
    },
    {
        q: 'How can local farms or grocery vendors sell on FreshMart?',
        a: 'Open the Seller Portal, register your store details, and once an administrator approves your store you can list products, monitor earnings & ratings, and manage incoming orders from your dedicated seller dashboard.',
    },
    {
        q: 'What happens if an item goes out of stock while I am checking out?',
        a: 'FreshMart uses real-time inventory checks and checkout holds to prevent overselling. If the last unit is claimed simultaneously, your checkout is protected and any duplicate payment is automatically refunded.',
    },
];

const Home = ({addProductToCart}) => {
    const dispatch = useDispatch();
    const user = useSelector((state) => state.authentication.user);
    const [openFaqIdx, setOpenFaqIdx] = useState(0);

    const {data: products = [], isPending} = useQuery({
        queryKey: ['recommendations', user?._id || 'guest'],
        queryFn: async () => {
            const res = await api.getRecommendations();
            const data = res.data || [];
            dispatch({type: FETCH_RECOMMENDATIONS, data});
            return data;
        },
        staleTime: 2 * 60 * 1000,
    });

    const {data: flashSales = []} = useQuery({
        queryKey: ['flashSales'],
        queryFn: async () => {
            const res = await api.getFlashSaleProducts();
            return res.data || [];
        },
        staleTime: 2 * 60 * 1000,
    });

    const {data: latestProductsData} = useQuery({
        queryKey: ['homeNewestProducts'],
        queryFn: async () => {
            const res = await api.getProductsPerPage(1);
            return res.data?.products || [];
        },
        staleTime: 2 * 60 * 1000,
    });

    const {data: pickupStations = []} = useQuery({
        queryKey: ['homePickupStations'],
        queryFn: async () => {
            const res = await api.fetchPickupStations();
            return Array.isArray(res.data) ? res.data : [];
        },
        staleTime: 5 * 60 * 1000,
    });

    const displayedFlashSales = flashSales.slice(0, 8);
    const nowMs = useLiveClock(displayedFlashSales.length > 0);

    const newestProducts = Array.isArray(latestProductsData) ? latestProductsData.slice(0, 8) : [];
    const activeStations = pickupStations.filter((st) => st.active !== false).slice(0, 4);
    const countdown = formatRemainingTime(
        getSoonestFlashSaleEndMs(displayedFlashSales, nowMs),
        nowMs
    );

    return (
        <div className={styles['wrapper']}>
            {/* 1. HERO SECTION */}
            <section className={styles['hero-section']}>
                <div className={styles['hero']}>
                    <div className={styles['hero-text']}>
                        <div className={styles['hero-pill']}>
                            <span className={styles['pulse-dot']}/>
                            <span>FARM-TO-DOORSTEP IN 20 MINUTES</span>
                        </div>

                        <h1 className={styles['hero-title']}>
                            Fresh Organic <span className={styles['highlight']}>Groceries</span> Delivered Fast.
                        </h1>

                        <p className={styles['hero-subtitle']}>
                            Skip the supermarket queues. Handpicked farm-fresh kale, ripe fruits, premium meats, and daily essentials delivered straight to your kitchen.
                        </p>

                        <div className={styles['hero-cta-group']}>
                            <Link className={'btn1'} to={'/products'}>
                                <span>Explore Fresh Aisles</span>
                                <span className="material-symbols-outlined">arrow_forward</span>
                            </Link>
                            <Link className={styles['secondary-cta']} to={'/orders'}>
                                <span className="material-symbols-outlined">local_shipping</span>
                                <span>Track Order</span>
                            </Link>
                        </div>

                        <div className={styles['hero-stats']}>
                            <div className={styles['stat-item']}>
                                <strong>50+</strong>
                                <span>Curated Products</span>
                            </div>
                            <div className={styles['stat-divider']}/>
                            <div className={styles['stat-item']}>
                                <strong>Up to 25%</strong>
                                <span>Flash Discounts</span>
                            </div>
                            <div className={styles['stat-divider']}/>
                            <div className={styles['stat-item']}>
                                <strong>100%</strong>
                                <span>Freshness Guarantee</span>
                            </div>
                        </div>
                    </div>

                    <div className={styles['hero-visual']}>
                        <div className={styles['glow-orb']}/>

                        <div className={`${styles['floating-card']} ${styles['float-top']}`}>
                            <span className={styles['float-emoji']}>🥬</span>
                            <div>
                                <strong>100% Farm Fresh</strong>
                                <small>Daily Harvest Checked</small>
                            </div>
                        </div>

                        <div className={styles['delivery']}>
                            <motion.img
                                drag
                                dragConstraints={{top: 0, right: 0, bottom: 0, left: 0}}
                                src={DeliveryImg}
                                alt={'Express Grocery Delivery'}
                            />
                        </div>

                        <div className={`${styles['floating-card']} ${styles['float-bottom']}`}>
                            <span className={styles['float-emoji']}>⚡</span>
                            <div>
                                <strong>20-Min Dispatch</strong>
                                <small>Live Order Tracking</small>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* 2. SHOP BY CATEGORY */}
            <section className={styles['section-container']}>
                <div className={styles['section-header']}>
                    <div>
                        <span className={styles['section-eyebrow']}>BROWSE BY AISLE</span>
                        <h2 className={styles['section-title']}>Shop by Category</h2>
                    </div>
                    <Link to={'/products'} className={styles['view-all-link']}>
                        <span>View All Aisles</span>
                        <span className="material-symbols-outlined">chevron_right</span>
                    </Link>
                </div>
                <Categories/>
            </section>

            {/* 3. JUST ARRIVED — FRESH NEWEST ADDITIONS */}
            {newestProducts.length > 0 && (
                <section className={styles['section-container']}>
                    <div className={styles['section-header']}>
                        <div>
                            <span className={styles['new-pill-tag']}>✨ JUST ARRIVED TODAY</span>
                            <h2 className={styles['section-title']}>Fresh New Arrivals</h2>
                            <p className={styles['section-sub']}>
                                Newly stocked groceries and newly approved farm partner produce—freshly listed at the top of our aisles.
                            </p>
                        </div>
                        <Link to={'/products'} className={styles['view-all-link']}>
                            <span>Explore Latest</span>
                            <span className="material-symbols-outlined">chevron_right</span>
                        </Link>
                    </div>

                    <div className={styles['products-wrapper']}>
                        {newestProducts.slice(0, 4).map((product, idx) => (
                            <ProductCard
                                key={product.product_id || idx}
                                product={product}
                                addProductToCart={addProductToCart}
                            />
                        ))}
                    </div>
                </section>
            )}

            {/* 4. FLASH SALES WITH LIVE COUNTDOWN TIMER */}
            {flashSales.length > 0 && (
                <section className={styles['section-container']}>
                    <div className={styles['flash-shelf']}>
                        <div className={styles['flash-shelf-header']}>
                            <div>
                                <span className={styles['flash-pill-tag']}>⚡ LIMITED-TIME FLASH DEALS</span>
                                <h2 className={styles['section-title']}>Today&apos;s Flash Sales &amp; Discounts</h2>
                            </div>
                            <div className={styles['flash-right']}>
                                <div className={styles['countdown-box']} aria-label="Time remaining for the soonest flash deal">
                                    <span className={styles['countdown-label']}>Ends in</span>
                                    <div className={styles['countdown-digits']}>
                                        {countdown.days > 0 && (
                                            <>
                                                <span>{countdown.days}d</span>
                                                <small>:</small>
                                            </>
                                        )}
                                        <span>{countdown.hrs}h</span>
                                        <small>:</small>
                                        <span>{countdown.mins}m</span>
                                        <small>:</small>
                                        <span>{countdown.secs}s</span>
                                    </div>
                                </div>
                                <Link to={'/products?flash=true'} className={styles['view-all-link']}>
                                    <span>Shop All Deals</span>
                                    <span className="material-symbols-outlined">chevron_right</span>
                                </Link>
                            </div>
                        </div>

                        <div className={styles['products-wrapper']}>
                            {displayedFlashSales.map((product, idx) => (
                                <ProductCard
                                    key={product.product_id || idx}
                                    product={product}
                                    addProductToCart={addProductToCart}
                                    showFlashTimer={true}
                                />
                            ))}
                        </div>
                    </div>
                </section>
            )}

            {/* 5. DUAL EDITORIAL SPOTLIGHT BANNERS (ORGANIC HARVEST + SELLER MARKETPLACE) */}
            <section className={styles['section-container']}>
                <div className={styles['promo-grid']}>
                    <div className={`${styles['promo-card']} ${styles['promo-emerald']}`}>
                        <div className={styles['promo-content']}>
                            <span className={styles['promo-eyebrow']}>🌿 DIRECT FROM KENYAN HIGHLANDS</span>
                            <h3>Certified Organic Greens &amp; Daily Harvest</h3>
                            <p>
                                Handpicked every morning in Limuru, Kiambu &amp; Rift Valley farms. Zero middlemen, full nutrition specs, and up to 25% off daily bundles.
                            </p>
                            <Link
                                to="/products?category=Fruits%20and%20Vegetables"
                                className={styles['promo-btn-light']}
                            >
                                <span>Shop Fruits &amp; Vegetables</span>
                                <span className="material-symbols-outlined">arrow_forward</span>
                            </Link>
                        </div>
                        <div className={styles['promo-badge-circle']}>
                            <strong>100%</strong>
                            <small>Organic</small>
                        </div>
                    </div>

                    <div className={`${styles['promo-card']} ${styles['promo-dark']}`}>
                        <div className={styles['promo-content']}>
                            <span className={styles['promo-eyebrow-gold']}>🏪 FRESHMART SELLER MARKETPLACE</span>
                            <h3>Grow Your Farm or Grocery Business Online</h3>
                            <p>
                                Join verified local producers on FreshMart. List products, monitor live earnings, track customer ratings, and fulfill orders in our Seller Portal.
                            </p>
                            <a
                                href="/seller"
                                target="_blank"
                                rel="noopener noreferrer"
                                className={styles['promo-btn-emerald']}
                            >
                                <span>Open Seller Portal</span>
                                <span className="material-symbols-outlined">open_in_new</span>
                            </a>
                        </div>
                        <div className={styles['promo-badge-dark']}>
                            <span className="material-symbols-outlined">storefront</span>
                            <small>Partner Hub</small>
                        </div>
                    </div>
                </div>
            </section>

            {/* 6. PERSONALIZED / RECOMMENDED FRESH PICKS */}
            <section className={styles['section-container']}>
                <div className={styles['section-header']}>
                    <div>
                        <span className={styles['section-eyebrow']}>
                            {products[0]?.personalized && user?.first_name
                                ? `PERSONALIZED FOR ${user.first_name.toUpperCase()}`
                                : 'HANDPICKED FOR YOU'}
                        </span>
                        <h2 className={styles['section-title']}>Recommended Fresh Picks</h2>
                    </div>
                    <Link to={'/products'} className={styles['view-all-link']}>
                        <span>See All 50+ Products</span>
                        <span className="material-symbols-outlined">chevron_right</span>
                    </Link>
                </div>

                {isPending && products.length === 0 ? (
                    <Loading text={'Curating fresh picks...'}/>
                ) : (
                    <div className={styles['categories-wrapper']}>
                        {products.map((item, i) => {
                            const shelfLink = item.is_personalized_shelf
                                ? '/products'
                                : `/products?category=${encodeURIComponent(item.category)}`;
                            return (
                                <div key={item.category || i} className={styles['category-wrapper']}>
                                    <div className={styles['category-shelf-head']}>
                                        <div className={styles['shelf-title-col']}>
                                            <div className={'heading2'}>
                                                <Link to={shelfLink}>{item.category}</Link>
                                            </div>
                                            {item.subtitle && (
                                                <p className={styles['shelf-subtitle']}>
                                                    {item.personalized ? '✨ ' : ''}
                                                    {item.subtitle}
                                                </p>
                                            )}
                                        </div>
                                        <Link to={shelfLink} className={styles['shelf-more']}>
                                            {item.is_personalized_shelf
                                                ? 'Browse Full Catalog →'
                                                : `Explore ${item.category} →`}
                                        </Link>
                                    </div>
                                    <div className={styles['products-wrapper']}>
                                        {item.products.map((product, j) => (
                                            <ProductCard
                                                addProductToCart={addProductToCart}
                                                product={product}
                                                showReason={Boolean(item.is_personalized_shelf)}
                                                key={product.product_id || `${i}${j}`}
                                            />
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                        <div className={styles['see-all-wrap']}>
                            <Link to={'/products'} className={'btn1'}>
                                <span>Browse Full Supermarket Catalog</span>
                                <span className="material-symbols-outlined">storefront</span>
                            </Link>
                        </div>
                    </div>
                )}
            </section>

            {/* 7. HOW FRESHMART WORKS (4-STEP EXPRESS JOURNEY) */}
            <section className={styles['section-container']}>
                <div className={styles['how-band']}>
                    <div className={styles['center-header']}>
                        <span className={styles['section-eyebrow']}>SIMPLE &amp; TRANSPARENT</span>
                        <h2 className={styles['section-title']}>From Highland Farm to Your Kitchen in 4 Steps</h2>
                        <p className={styles['center-sub']}>
                            Real-time stock locking, live delivery progress timelines, and instant downloadable POS receipts on every order.
                        </p>
                    </div>

                    <div className={styles['steps-grid']}>
                        {HOW_IT_WORKS.map((item) => (
                            <div key={item.step} className={styles['step-card']}>
                                <div className={styles['step-top']}>
                                    <div className={styles['step-icon']}>
                                        <span className="material-symbols-outlined">{item.icon}</span>
                                    </div>
                                    <span className={styles['step-num']}>{item.step}</span>
                                </div>
                                <h3>{item.title}</h3>
                                <p>{item.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* 8. LIVE PICKUP STATIONS & EXPRESS DELIVERY COVERAGE */}
            <section className={styles['section-container']}>
                <div className={styles['section-header']}>
                    <div>
                        <span className={styles['section-eyebrow']}>FLEXIBLE FULFILLMENT</span>
                        <h2 className={styles['section-title']}>Doorstep Delivery &amp; Free Pickup Hubs</h2>
                        <p className={styles['section-sub']}>
                            Choose 20-minute express doorstep dispatch or collect free at any FreshMart Pickup Station across Nairobi.
                        </p>
                    </div>
                    <Link to={'/shipping'} className={styles['view-all-link']}>
                        <span>Track My Shipments</span>
                        <span className="material-symbols-outlined">chevron_right</span>
                    </Link>
                </div>

                <div className={styles['hubs-grid']}>
                    <div className={styles['doorstep-highlight-card']}>
                        <span className={styles['hub-badge-green']}>⚡ 20-MIN EXPRESS</span>
                        <h3>Direct Doorstep Rider Dispatch</h3>
                        <p>
                            Chilled coolers, insulated grocery bags, and live status notifications at every milestone—from Order Placed to Delivered.
                        </p>
                        <ul className={styles['hub-perks']}>
                            <li>
                                <span className="material-symbols-outlined">check_circle</span>
                                Free express delivery across Nairobi estates
                            </li>
                            <li>
                                <span className="material-symbols-outlined">check_circle</span>
                                Live email + bell status alerts &amp; POS PDF receipt
                            </li>
                            <li>
                                <span className="material-symbols-outlined">check_circle</span>
                                Rate your produce &amp; seller after delivery
                            </li>
                        </ul>
                        <Link to="/products" className={styles['hub-cta']}>
                            <span>Start an Express Order</span>
                            <span className="material-symbols-outlined">arrow_forward</span>
                        </Link>
                    </div>

                    <div className={styles['stations-list-grid']}>
                        {(activeStations.length > 0
                            ? activeStations
                            : [
                                  {
                                      station_id: 'hub-1',
                                      name: 'Westlands FreshMart Hub',
                                      area: 'Westlands',
                                      city: 'Nairobi',
                                      landmark: 'Near Sarit Centre Main Gate',
                                      opening_hours: 'Mon–Sun: 7:00 AM – 9:00 PM',
                                  },
                                  {
                                      station_id: 'hub-2',
                                      name: 'Kilimani Green Point',
                                      area: 'Kilimani',
                                      city: 'Nairobi',
                                      landmark: 'Yaya Centre Arcade',
                                      opening_hours: 'Mon–Sun: 7:30 AM – 8:30 PM',
                                  },
                                  {
                                      station_id: 'hub-3',
                                      name: 'CBD Express Collection',
                                      area: 'Nairobi CBD',
                                      city: 'Nairobi',
                                      landmark: 'Kenyatta Avenue Ground Floor',
                                      opening_hours: 'Mon–Sat: 7:00 AM – 8:00 PM',
                                  },
                                  {
                                      station_id: 'hub-4',
                                      name: 'Karen Garden Hub',
                                      area: 'Karen',
                                      city: 'Nairobi',
                                      landmark: 'The Hub Karen East Wing',
                                      opening_hours: 'Mon–Sun: 8:00 AM – 8:00 PM',
                                  },
                              ]
                        ).map((st) => (
                            <div key={st.station_id || st._id || st.name} className={styles['station-card']}>
                                <div className={styles['station-top']}>
                                    <span className={styles['station-icon']}>
                                        <span className="material-symbols-outlined">storefront</span>
                                    </span>
                                    <span className={styles['free-tag']}>FREE PICKUP</span>
                                </div>
                                <h4>{st.name}</h4>
                                <p className={styles['station-loc']}>
                                    <span className="material-symbols-outlined">location_on</span>
                                    <span>
                                        {[st.landmark, st.area, st.city].filter(Boolean).join(', ')}
                                    </span>
                                </p>
                                {st.opening_hours && (
                                    <p className={styles['station-hours']}>
                                        <span className="material-symbols-outlined">schedule</span>
                                        <span>{st.opening_hours}</span>
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* 9. VERIFIED CUSTOMER REVIEWS & TRUST METRICS */}
            <section className={styles['section-container']}>
                <div className={styles['reviews-band']}>
                    <div className={styles['reviews-header']}>
                        <div>
                            <span className={styles['section-eyebrow']}>LOVED BY NAIROBI HOUSEHOLDS</span>
                            <h2 className={styles['section-title']}>What Our Shoppers Say</h2>
                        </div>
                        <div className={styles['trust-metrics']}>
                            <div>
                                <strong>4.9 ★</strong>
                                <small>Verified Rating</small>
                            </div>
                            <div>
                                <strong>20 min</strong>
                                <small>Avg Dispatch</small>
                            </div>
                            <div>
                                <strong>100%</strong>
                                <small>Verified Buyers</small>
                            </div>
                        </div>
                    </div>

                    <div className={styles['testimonials-grid']}>
                        {TESTIMONIALS.map((t, idx) => (
                            <div key={idx} className={styles['testimonial-card']}>
                                <div className={styles['t-stars']}>{'★'.repeat(t.rating)}</div>
                                <p className={styles['t-quote']}>&ldquo;{t.quote}&rdquo;</p>
                                <div className={styles['t-author']}>
                                    <div className={styles['t-avatar']}>{t.name.charAt(0)}</div>
                                    <div>
                                        <strong>{t.name}</strong>
                                        <small>
                                            {t.area} • {t.tag}
                                        </small>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* 10. WHY CHOOSE FRESHMART */}
            <section className={styles['why-section']}>
                <div className={styles['why']}>
                    <div className={styles['why-component']}>
                        <div className={styles['why-icon-box']}>
                            <img src={DeliveryIcon} alt={'Delivery'}/>
                        </div>
                        <div className={'why-text'}>
                            <div className={styles['why-title']}>Under 20 Minutes</div>
                            <div className={styles['why-desc']}>
                                Hyper-local riders deliver your groceries hot, chilled, and on time.
                            </div>
                        </div>
                    </div>
                    <div className={styles['why-component']}>
                        <div className={styles['why-icon-box']}>
                            <img src={ReliableIcon} alt={'Reliable'}/>
                        </div>
                        <div className={'why-text'}>
                            <div className={styles['why-title']}>Farm-Fresh Quality</div>
                            <div className={styles['why-desc']}>
                                Every vegetable, fruit, and cut of meat is quality-inspected daily.
                            </div>
                        </div>
                    </div>
                    <div className={styles['why-component']}>
                        <div className={styles['why-icon-box']}>
                            <img src={PricesIcon} alt={'Prices'}/>
                        </div>
                        <div className={'why-text'}>
                            <div className={styles['why-title']}>Unbeatable Local Prices</div>
                            <div className={styles['why-desc']}>
                                Direct farm partnerships mean lower prices and daily bundle offers.
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* 11. INTERACTIVE FAQ ACCORDION */}
            <section className={styles['section-container']}>
                <div className={styles['faq-wrap']}>
                    <div className={styles['center-header']}>
                        <span className={styles['section-eyebrow']}>GOT QUESTIONS?</span>
                        <h2 className={styles['section-title']}>Frequently Asked Questions</h2>
                        <p className={styles['center-sub']}>
                            Everything you need to know about FreshMart express delivery, Pickup Stations, POS receipts, and selling with us.
                        </p>
                    </div>

                    <div className={styles['faq-list']}>
                        {FAQ_ITEMS.map((item, idx) => {
                            const isOpen = openFaqIdx === idx;
                            return (
                                <div
                                    key={idx}
                                    className={`${styles['faq-item']} ${isOpen ? styles['faq-open'] : ''}`}
                                >
                                    <button
                                        type="button"
                                        className={styles['faq-trigger']}
                                        onClick={() => setOpenFaqIdx(isOpen ? -1 : idx)}
                                        aria-expanded={isOpen}
                                    >
                                        <span>{item.q}</span>
                                        <span className="material-symbols-outlined">
                                            {isOpen ? 'remove' : 'add'}
                                        </span>
                                    </button>
                                    {isOpen && <p className={styles['faq-answer']}>{item.a}</p>}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* 12. BOTTOM CONVERSION BANNER */}
            <section className={styles['section-container']}>
                <div className={styles['final-cta-banner']}>
                    <div className={styles['final-cta-text']}>
                        <span className={styles['final-pill']}>⚡ READY TO SHOP FRESH?</span>
                        <h2>Fill Your Basket with Farm-Fresh Groceries Today</h2>
                        <p>
                            Enjoy free express delivery, verified local produce, real-time tracking, and instant POS PDF receipts on every order.
                        </p>
                    </div>
                    <div className={styles['final-cta-actions']}>
                        <Link to="/products" className={styles['final-btn-primary']}>
                            <span>Start Shopping Now</span>
                            <span className="material-symbols-outlined">shopping_cart</span>
                        </Link>
                        <a
                            href="/seller"
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles['final-btn-outline']}
                        >
                            <span>Become a Seller</span>
                            <span className="material-symbols-outlined">open_in_new</span>
                        </a>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default Home;
