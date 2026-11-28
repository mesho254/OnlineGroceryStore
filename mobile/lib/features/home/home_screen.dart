import 'package:flutter/material.dart';
import '../../core/config/api_endpoints.dart';
import '../../core/network/api_client.dart';
import '../../core/network/auth_session_manager.dart';
import '../../core/utils/app_utils.dart';
import '../../shared/widgets/shared_widgets.dart';

/// 12-Section Scrollable Homepage (Matches client/src/pages/home/Home.js & Screenshot 1)
/// Renders immediately on frame 1 from SWR cache without blocking on network calls.
class HomeScreen extends StatefulWidget {
  final void Function({String? category, bool flashOnly}) onNavigateProducts;
  final ValueChanged<Map<String, dynamic>> onOpenProductDetails;
  final VoidCallback onNavigateOrders;
  final VoidCallback onOpenSellerPortal;
  final void Function(Map<String, dynamic> product) onToggleWishlist;
  final void Function(Map<String, dynamic> product, int nextQty) onUpdateCartQty;

  const HomeScreen({
    super.key,
    required this.onNavigateProducts,
    required this.onOpenProductDetails,
    required this.onNavigateOrders,
    required this.onOpenSellerPortal,
    required this.onToggleWishlist,
    required this.onUpdateCartQty,
  });

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  List<Map<String, dynamic>> _recommendationShelves = [];
  List<Map<String, dynamic>> _flashSales = [];
  List<Map<String, dynamic>> _newestProducts = [];
  List<Map<String, dynamic>> _pickupStations = [];
  bool _loadingRecs = false;
  int _openFaqIdx = 0;

  static const List<Map<String, dynamic>> howItWorks = [
    {
      'step': '01',
      'icon': Icons.shopping_basket_outlined,
      'title': 'Pick Fresh Aisles',
      'desc':
          'Browse highland greens, ripe fruits, dairy, prime meats, and pantry essentials sourced directly from verified Kenyan farms.',
    },
    {
      'step': '02',
      'icon': Icons.verified_user_outlined,
      'title': 'Instant Checkout & Stock Lock',
      'desc':
          'Check out securely with real-time stock verification so your selected items are immediately reserved for your basket.',
    },
    {
      'step': '03',
      'icon': Icons.inventory_2_outlined,
      'title': 'Quality-Checked & Packed',
      'desc':
          'Our dispatch hub inspects every item for peak freshness and packs chilled and dry groceries separately.',
    },
    {
      'step': '04',
      'icon': Icons.local_shipping_outlined,
      'title': '20-Min Delivery & POS Receipt',
      'desc':
          'Track your rider live to your doorstep or Pickup Hub, and receive your downloadable POS PDF receipt upon delivery.',
    },
  ];

  static const List<Map<String, dynamic>> testimonials = [
    {
      'name': 'Wanjiku M.',
      'area': 'Kilimani, Nairobi',
      'tag': 'Weekly Produce Buyer',
      'quote':
          'The sukuma wiki and Hass avocados arrived crisper than the morning market—literally 18 minutes after checkout, with a clean POS receipt in my email!',
    },
    {
      'name': 'Brian O.',
      'area': 'Westlands, Nairobi',
      'tag': 'Pickup Station Regular',
      'quote':
          'I order on my way from work and grab my chilled groceries at the Westlands Pickup Hub for free. Live status notifications keep me posted every step.',
    },
    {
      'name': 'Amina H.',
      'area': 'Lavington, Nairobi',
      'tag': 'Family Pantry Shopper',
      'quote':
          'Flash sales save our household thousands of shillings every month, and every seller rating is backed by verified delivered orders.',
    },
  ];

  static const List<Map<String, String>> faqItems = [
    {
      'q': 'How fast is KijaniMart express doorstep delivery?',
      'a':
          'Orders placed within our active Nairobi coverage zones are handpicked, packed, and dispatched within minutes—arriving at your doorstep in under 20 minutes on average, with live step-by-step shipment tracking.',
    },
    {
      'q': 'Can I collect my order from a Pickup Station instead?',
      'a':
          'Yes! At checkout you can choose any convenient KijaniMart Pickup Station across Nairobi for FREE collection. We notify you by email and in-app alert the moment your order is ready for pickup.',
    },
    {
      'q': 'Do I get an official receipt for my grocery orders?',
      'a':
          'Every confirmed order includes a thermal POS-style PDF receipt complete with itemized prices, VAT breakdown, and order barcode. You can download it anytime from your Order Receipt page, and it is also attached automatically to your Delivered email.',
    },
    {
      'q': 'How do you guarantee produce freshness?',
      'a':
          'All produce is harvested daily by verified farm partners and checked before dispatch. Every product page displays harvest dates, shelf life, storage tips, and verified buyer ratings.',
    },
    {
      'q': 'How can local farms or grocery vendors sell on KijaniMart?',
      'a':
          'Open the Seller Portal, register your store details, and once an administrator approves your store you can list products, monitor earnings & ratings, and manage incoming orders from your dedicated seller dashboard.',
    },
    {
      'q': 'What happens if an item goes out of stock while I am checking out?',
      'a':
          'KijaniMart uses real-time inventory checks and checkout holds to prevent overselling. If the last unit is claimed simultaneously, your checkout is protected and any duplicate payment is automatically refunded.',
    },
  ];

  @override
  void initState() {
    super.initState();
    _hydrateFromCacheAndFetch();
  }

  Future<void> _hydrateFromCacheAndFetch({bool force = false}) async {
    final session = AuthSessionManager.instance;
    final userId = session.customerSession?.userId ?? 'guest';
    final recKey = 'recommendations_$userId';

    // 1. Instant 0ms hydration from SWR cache
    final cachedRecs = session.getCachedQuery<List>(recKey);
    final cachedFlash = session.getCachedQuery<List>('flashSales');
    final cachedNewest = session.getCachedQuery<List>('homeNewestProducts');
    final cachedStations = session.getCachedQuery<List>('homePickupStations');

    setState(() {
      if (cachedRecs != null) {
        _recommendationShelves =
            cachedRecs.map((e) => Map<String, dynamic>.from(e as Map)).toList();
      }
      if (cachedFlash != null) {
        _flashSales = cachedFlash
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList();
      }
      if (cachedNewest != null) {
        _newestProducts = cachedNewest
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList();
      }
      if (cachedStations != null) {
        _pickupStations = cachedStations
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList();
      }
    });

    // 2. Fetch stale queries in parallel in background
    final futures = <Future>[];

    if (force || !session.isQueryFresh(recKey)) {
      if (_recommendationShelves.isEmpty) {
        setState(() => _loadingRecs = true);
      }
      futures.add(
        ApiClient.instance.dio
            .get(ApiEndpoints.recommendations)
            .then((res) async {
          if (res.data is List) {
            final list = (res.data as List)
                .map((e) => Map<String, dynamic>.from(e as Map))
                .toList();
            await session.setCachedQuery(recKey, list);
            if (mounted) setState(() => _recommendationShelves = list);
          }
        }).catchError((_) {}).whenComplete(() {
          if (mounted) setState(() => _loadingRecs = false);
        }),
      );
    }

    if (force || !session.isQueryFresh('flashSales')) {
      futures.add(
        ApiClient.instance.dio.get(ApiEndpoints.flashSales).then((res) async {
          if (res.data is List) {
            final list = (res.data as List)
                .map((e) => Map<String, dynamic>.from(e as Map))
                .toList();
            await session.setCachedQuery('flashSales', list);
            if (mounted) setState(() => _flashSales = list);
          }
        }).catchError((_) {}),
      );
    }

    if (force || !session.isQueryFresh('homeNewestProducts')) {
      futures.add(
        ApiClient.instance.dio
            .get(ApiEndpoints.productsPerPage(1))
            .then((res) async {
          if (res.data is Map && res.data['products'] is List) {
            final list = (res.data['products'] as List)
                .map((e) => Map<String, dynamic>.from(e as Map))
                .toList();
            await session.setCachedQuery('homeNewestProducts', list);
            if (mounted) setState(() => _newestProducts = list);
          }
        }).catchError((_) {}),
      );
    }

    if (force ||
        !session.isQueryFresh('homePickupStations', staleTimeMs: 300000)) {
      futures.add(
        ApiClient.instance.dio
            .get(ApiEndpoints.pickupStations)
            .then((res) async {
          if (res.data is List) {
            final list = (res.data as List)
                .map((e) => Map<String, dynamic>.from(e as Map))
                .toList();
            await session.setCachedQuery('homePickupStations', list);
            if (mounted) setState(() => _pickupStations = list);
          }
        }).catchError((_) {}),
      );
    }

    await Future.wait(futures);
  }

  @override
  Widget build(BuildContext context) {
    final user = AuthSessionManager.instance.customerSession;
    final displayedFlash = _flashSales.take(8).toList();
    final displayedNewest = _newestProducts.take(4).toList();
    final activeStations = _pickupStations
        .where((s) => s['active'] != false)
        .take(4)
        .toList();

    return RefreshIndicator(
      color: KijaniColors.emerald,
      onRefresh: () => _hydrateFromCacheAndFetch(force: true),
      child: ListView(
        padding: const EdgeInsets.only(bottom: 40),
        children: [
          // 1. HERO SECTION — Deep Emerald Promo Card with Produce Imagery
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            child: Container(
              clipBehavior: Clip.antiAlias,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(26),
                gradient: const LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    Color(0xFF064E3B),
                    Color(0xFF047857),
                    Color(0xFF10B981),
                  ],
                ),
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFF064E3B).withValues(alpha: 0.28),
                    blurRadius: 22,
                    offset: const Offset(0, 10),
                  ),
                ],
              ),
              child: Stack(
                children: [
                  Positioned(
                    right: -46,
                    top: -46,
                    child: Container(
                      width: 170,
                      height: 170,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: Colors.white.withValues(alpha: 0.08),
                      ),
                    ),
                  ),
                  Positioned(
                    left: -30,
                    bottom: -50,
                    child: Container(
                      width: 130,
                      height: 130,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: Colors.white.withValues(alpha: 0.06),
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(18, 18, 14, 18),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 5,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(999),
                            border: Border.all(
                              color: Colors.white.withValues(alpha: 0.25),
                            ),
                          ),
                          child: const Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                Icons.bolt_rounded,
                                size: 13,
                                color: Color(0xFFFBBF24),
                              ),
                              SizedBox(width: 4),
                              Text(
                                'FARM-TO-DOORSTEP IN 20 MIN',
                                style: TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w800,
                                  color: Colors.white,
                                  letterSpacing: 0.5,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 12),
                        RichText(
                          text: const TextSpan(
                            style: TextStyle(
                              fontSize: 25,
                              fontWeight: FontWeight.w900,
                              color: Colors.white,
                              height: 1.15,
                              letterSpacing: -0.4,
                            ),
                            children: [
                              TextSpan(text: 'Fresh Organic '),
                              TextSpan(
                                text: 'Groceries',
                                style: TextStyle(color: Color(0xFFA7F3D0)),
                              ),
                              TextSpan(text: ' Delivered Fast.'),
                            ],
                          ),
                        ),
                        const SizedBox(height: 12),
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'Handpicked farm-fresh kale, ripe fruits, premium meats & daily essentials — straight to your kitchen.',
                                    style: TextStyle(
                                      fontSize: 12.5,
                                      color:
                                          Colors.white.withValues(alpha: 0.85),
                                      height: 1.4,
                                    ),
                                  ),
                                  const SizedBox(height: 14),
                                  ElevatedButton.icon(
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: Colors.white,
                                      foregroundColor: KijaniColors.emeraldDark,
                                      elevation: 0,
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 16,
                                        vertical: 11,
                                      ),
                                      shape: RoundedRectangleBorder(
                                        borderRadius: BorderRadius.circular(999),
                                      ),
                                    ),
                                    onPressed: () => widget.onNavigateProducts(),
                                    icon: const Text(
                                      'Shop Now',
                                      style: TextStyle(
                                        fontWeight: FontWeight.w900,
                                      ),
                                    ),
                                    label: const Icon(
                                      Icons.arrow_forward_rounded,
                                      size: 17,
                                    ),
                                  ),
                                  const SizedBox(height: 8),
                                  OutlinedButton(
                                    style: OutlinedButton.styleFrom(
                                      foregroundColor: Colors.white,
                                      side: BorderSide(
                                        color: Colors.white
                                            .withValues(alpha: 0.55),
                                      ),
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 16,
                                        vertical: 10,
                                      ),
                                      shape: RoundedRectangleBorder(
                                        borderRadius: BorderRadius.circular(999),
                                      ),
                                    ),
                                    onPressed: () => widget.onNavigateProducts(
                                      flashOnly: true,
                                    ),
                                    child: const Text(
                                      '⚡ Flash Deals',
                                      style: TextStyle(
                                        fontWeight: FontWeight.w800,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(width: 6),
                            Image.asset(
                              'assets/images/categories/fruits_vegetables.png',
                              width: 140,
                              fit: BoxFit.contain,
                              errorBuilder: (_, __, ___) =>
                                  const SizedBox(width: 140),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: KijaniColors.slate200),
              ),
              child: Row(
                children: [
                  _buildHeroStat('50+', 'Curated Products'),
                  _buildStatDivider(),
                  _buildHeroStat('25%', 'Flash Discounts'),
                  _buildStatDivider(),
                  _buildHeroStat('100%', 'Fresh Guarantee'),
                ],
              ),
            ),
          ),

          // 2. SHOP BY CATEGORY
          const SizedBox(height: 18),
          _buildSectionHeader(
            eyebrow: 'BROWSE BY AISLE',
            title: 'Shop by Category',
            actionLabel: 'View All Aisles >',
            onAction: () => widget.onNavigateProducts(),
          ),
          CategoryAisleStrip(
            selectedCategory: 'All',
            onSelectCategory: (cat) =>
                widget.onNavigateProducts(category: cat),
          ),

          // 3. JUST ARRIVED — FRESH NEW ARRIVALS
          if (displayedNewest.isNotEmpty) ...[
            const SizedBox(height: 24),
            _buildSectionHeader(
              eyebrow: '✨ JUST ARRIVED TODAY',
              title: 'Fresh New Arrivals',
              actionLabel: 'Explore Latest >',
              onAction: () => widget.onNavigateProducts(),
            ),
            _buildProductGrid(displayedNewest),
          ],

          // 4. FLASH SALES WITH LIVE COUNTDOWN TIMER
          if (displayedFlash.isNotEmpty) ...[
            const SizedBox(height: 26),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Wrap(
                    alignment: WrapAlignment.spaceBetween,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    spacing: 8,
                    runSpacing: 6,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: KijaniColors.amber,
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: const Text(
                          '⚡ LIMITED-TIME FLASH DEALS',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 10,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                      TextButton(
                        onPressed: () =>
                            widget.onNavigateProducts(flashOnly: true),
                        child: const Text(
                          'Shop All Deals >',
                          style: TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w800,
                            color: KijaniColors.emerald,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const Text(
                    "Today's Flash Sales & Discounts",
                    style: TextStyle(
                      fontSize: 19,
                      fontWeight: FontWeight.w900,
                      color: KijaniColors.slate900,
                    ),
                  ),
                  const SizedBox(height: 8),
                  // Header Countdown Pill Synced to Soonest Product flash_sale_ends_at
                  StreamBuilder<int>(
                    stream: FlashCountdown.liveClockStream,
                    builder: (context, snapshot) {
                      final nowMs = snapshot.data ??
                          DateTime.now().millisecondsSinceEpoch;
                      final soonestMs =
                          FlashCountdown.getSoonestFlashSaleEndMs(
                        displayedFlash,
                        nowMs,
                      );
                      final rem =
                          FlashCountdown.formatRemainingTime(soonestMs, nowMs);
                      return Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 7,
                        ),
                        decoration: BoxDecoration(
                          color: KijaniColors.slate900,
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Text(
                              'ENDS IN  ',
                              style: TextStyle(
                                color: Color(0xFF94A3B8),
                                fontSize: 10.5,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            Text(
                              rem.toBannerClock(),
                              style: const TextStyle(
                                color: Color(0xFFFBBF24),
                                fontFamily: 'monospace',
                                fontSize: 12.5,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            _buildProductGrid(displayedFlash, showFlashTimer: true),
          ],

          // 5. DUAL EDITORIAL SPOTLIGHT BANNERS
          const SizedBox(height: 26),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Column(
              children: [
                _buildSpotlightCard(
                  eyebrow: '🌿 DIRECT FROM KENYAN HIGHLANDS',
                  title: 'Certified Organic Greens & Daily Harvest',
                  desc:
                      'Handpicked every morning in Limuru, Kiambu & Rift Valley farms. Zero middlemen, full nutrition specs, and up to 25% off daily bundles.',
                  btnLabel: 'Shop Fruits & Vegetables →',
                  gradient: const [
                    Color(0xFF065F46),
                    Color(0xFF059669),
                    Color(0xFF10B981),
                  ],
                  onTap: () => widget.onNavigateProducts(
                    category: 'Fruits and Vegetables',
                  ),
                ),
                const SizedBox(height: 12),
                _buildSpotlightCard(
                  eyebrow: '🏪 KIJANIMART SELLER MARKETPLACE',
                  title: 'Grow Your Farm or Grocery Business Online',
                  desc:
                      'Join verified local producers on KijaniMart. List products, monitor live earnings, track customer ratings, and fulfill orders in our Seller Center.',
                  btnLabel: 'Open Seller Portal ↗',
                  gradient: const [
                    Color(0xFF0F172A),
                    Color(0xFF1E293B),
                    Color(0xFF064E3B),
                  ],
                  onTap: widget.onOpenSellerPortal,
                ),
              ],
            ),
          ),

          // 6. PERSONALIZED / RECOMMENDED FRESH PICKS
          const SizedBox(height: 26),
          _buildSectionHeader(
            eyebrow: (_recommendationShelves.isNotEmpty &&
                    _recommendationShelves.first['personalized'] == true &&
                    (user?.firstName.isNotEmpty ?? false))
                ? 'PERSONALIZED FOR ${user!.firstName.toUpperCase()}'
                : 'HANDPICKED FOR YOU',
            title: 'Recommended Fresh Picks',
            actionLabel: 'See All 50+ >',
            onAction: () => widget.onNavigateProducts(),
          ),
          if (_loadingRecs && _recommendationShelves.isEmpty)
            const Padding(
              padding: EdgeInsets.all(28),
              child: Center(
                child: CircularProgressIndicator(color: KijaniColors.emerald),
              ),
            )
          else
            ..._recommendationShelves.map((shelf) {
              final catName = (shelf['category'] ?? 'Fresh Picks').toString();
              final subtitle = shelf['subtitle']?.toString();
              final isPersonalizedShelf =
                  shelf['is_personalized_shelf'] == true;
              final shelfProds = (shelf['products'] as List?)
                      ?.map((e) => Map<String, dynamic>.from(e as Map))
                      .toList() ??
                  [];
              if (shelfProds.isEmpty) return const SizedBox.shrink();
              return Padding(
                padding: const EdgeInsets.only(bottom: 20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  catName,
                                  style: const TextStyle(
                                    fontSize: 16.5,
                                    fontWeight: FontWeight.w900,
                                    color: KijaniColors.slate900,
                                  ),
                                ),
                                if (subtitle != null && subtitle.isNotEmpty)
                                  Text(
                                    '${shelf['personalized'] == true ? '✨ ' : ''}$subtitle',
                                    style: const TextStyle(
                                      fontSize: 11.5,
                                      color: KijaniColors.slate500,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                              ],
                            ),
                          ),
                          TextButton(
                            onPressed: () => widget.onNavigateProducts(
                              category: isPersonalizedShelf ? null : catName,
                            ),
                            child: Text(
                              isPersonalizedShelf
                                  ? 'Full Catalog →'
                                  : 'Explore →',
                              style: const TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w800,
                                color: KijaniColors.emerald,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 8),
                    _buildProductGrid(
                      shelfProds,
                      showReason: isPersonalizedShelf,
                    ),
                  ],
                ),
              );
            }),

          // 7. HOW KIJANIMART WORKS (4-STEP EXPRESS JOURNEY)
          const SizedBox(height: 16),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(22),
                border: Border.all(color: KijaniColors.slate200),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'SIMPLE & TRANSPARENT',
                    style: TextStyle(
                      fontSize: 10.5,
                      fontWeight: FontWeight.w800,
                      color: KijaniColors.emerald,
                    ),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'From Highland Farm to Your Kitchen in 4 Steps',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w900,
                      color: KijaniColors.slate900,
                    ),
                  ),
                  const SizedBox(height: 14),
                  ...howItWorks.map(
                    (st) => Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            width: 38,
                            height: 38,
                            decoration: BoxDecoration(
                              color: KijaniColors.emeraldLight,
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Icon(
                              st['icon'] as IconData,
                              color: KijaniColors.emerald,
                              size: 20,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  '${st['step']} • ${st['title']}',
                                  style: const TextStyle(
                                    fontSize: 13.5,
                                    fontWeight: FontWeight.w800,
                                    color: KijaniColors.slate900,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  st['desc'] as String,
                                  style: const TextStyle(
                                    fontSize: 12,
                                    color: KijaniColors.slate700,
                                    height: 1.4,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),

          // 8. LIVE PICKUP STATIONS & EXPRESS DELIVERY COVERAGE
          const SizedBox(height: 24),
          _buildSectionHeader(
            eyebrow: 'FLEXIBLE FULFILLMENT',
            title: 'Doorstep Delivery & Free Pickup Hubs',
            actionLabel: 'Track Shipments >',
            onAction: widget.onNavigateOrders,
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Column(
              children: [
                ...(activeStations.isNotEmpty
                        ? activeStations
                        : [
                            {
                              'name': 'Westlands KijaniMart Hub',
                              'area': 'Westlands',
                              'city': 'Nairobi',
                              'landmark': 'Near Sarit Centre Main Gate',
                              'opening_hours': 'Mon–Sun: 7:00 AM – 9:00 PM',
                            },
                            {
                              'name': 'Kilimani Green Point',
                              'area': 'Kilimani',
                              'city': 'Nairobi',
                              'landmark': 'Yaya Centre Arcade',
                              'opening_hours': 'Mon–Sun: 7:30 AM – 8:30 PM',
                            },
                          ])
                    .map(
                  (st) => Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: KijaniColors.slate200),
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 40,
                          height: 40,
                          decoration: BoxDecoration(
                            color: KijaniColors.emeraldLight,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: const Icon(
                            Icons.storefront_rounded,
                            color: KijaniColors.emerald,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                mainAxisAlignment:
                                    MainAxisAlignment.spaceBetween,
                                children: [
                                  Expanded(
                                    child: Text(
                                      (st['name'] ?? 'Pickup Hub').toString(),
                                      style: const TextStyle(
                                        fontSize: 13.5,
                                        fontWeight: FontWeight.w800,
                                        color: KijaniColors.slate900,
                                      ),
                                    ),
                                  ),
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 7,
                                      vertical: 2,
                                    ),
                                    decoration: BoxDecoration(
                                      color: KijaniColors.emeraldLight,
                                      borderRadius: BorderRadius.circular(999),
                                    ),
                                    child: const Text(
                                      'FREE PICKUP',
                                      style: TextStyle(
                                        fontSize: 9.5,
                                        fontWeight: FontWeight.w800,
                                        color: KijaniColors.emeraldDark,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 3),
                              Text(
                                [st['landmark'], st['area'], st['city']]
                                    .where((e) =>
                                        e != null && e.toString().isNotEmpty)
                                    .join(', '),
                                style: const TextStyle(
                                  fontSize: 11.5,
                                  color: KijaniColors.slate700,
                                ),
                              ),
                              if (st['opening_hours'] != null)
                                Text(
                                  st['opening_hours'].toString(),
                                  style: const TextStyle(
                                    fontSize: 11,
                                    color: KijaniColors.slate500,
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),

          // 9. VERIFIED CUSTOMER REVIEWS & TRUST METRICS
          const SizedBox(height: 24),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'LOVED BY NAIROBI HOUSEHOLDS',
                  style: TextStyle(
                    fontSize: 10.5,
                    fontWeight: FontWeight.w800,
                    color: KijaniColors.emerald,
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  'What Our Shoppers Say',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
                    color: KijaniColors.slate900,
                  ),
                ),
                const SizedBox(height: 10),
                ...testimonials.map(
                  (t) => Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: KijaniColors.slate200),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          '★★★★★',
                          style: TextStyle(
                            color: KijaniColors.amber,
                            fontSize: 14,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          '"${t['quote']}"',
                          style: const TextStyle(
                            fontSize: 12.5,
                            color: KijaniColors.slate700,
                            height: 1.45,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          '${t['name']} • ${t['area']} (${t['tag']})',
                          style: const TextStyle(
                            fontSize: 11.5,
                            fontWeight: FontWeight.w800,
                            color: KijaniColors.slate900,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),

          // 10. WHY CHOOSE KIJANIMART
          const SizedBox(height: 20),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                _buildWhyCard(
                  Icons.bolt_rounded,
                  'Under 20 Mins',
                  'Hyper-local riders deliver chilled & on time.',
                ),
                const SizedBox(width: 8),
                _buildWhyCard(
                  Icons.verified_rounded,
                  'Farm-Fresh',
                  'Every fruit, green & cut is inspected daily.',
                ),
                const SizedBox(width: 8),
                _buildWhyCard(
                  Icons.sell_rounded,
                  'Best Prices',
                  'Direct farm partnerships & daily flash deals.',
                ),
              ],
            ),
          ),

          // 11. INTERACTIVE FAQ ACCORDION
          const SizedBox(height: 26),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: KijaniColors.slate200),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'GOT QUESTIONS?',
                    style: TextStyle(
                      fontSize: 10.5,
                      fontWeight: FontWeight.w800,
                      color: KijaniColors.emerald,
                    ),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'Frequently Asked Questions',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w900,
                      color: KijaniColors.slate900,
                    ),
                  ),
                  const SizedBox(height: 10),
                  ...List.generate(faqItems.length, (idx) {
                    final item = faqItems[idx];
                    final isOpen = _openFaqIdx == idx;
                    return Container(
                      margin: const EdgeInsets.only(bottom: 8),
                      decoration: BoxDecoration(
                        color: isOpen ? KijaniColors.emeraldLight : KijaniColors.slate50,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: isOpen
                              ? KijaniColors.emeraldBorder
                              : KijaniColors.slate200,
                        ),
                      ),
                      child: Column(
                        children: [
                          ListTile(
                            dense: true,
                            title: Text(
                              item['q']!,
                              style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w800,
                                color: KijaniColors.slate900,
                              ),
                            ),
                            trailing: Icon(
                              isOpen ? Icons.remove : Icons.add,
                              size: 18,
                              color: KijaniColors.emerald,
                            ),
                            onTap: () => setState(
                              () => _openFaqIdx = isOpen ? -1 : idx,
                            ),
                          ),
                          if (isOpen)
                            Padding(
                              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                              child: Text(
                                item['a']!,
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: KijaniColors.slate700,
                                  height: 1.45,
                                ),
                              ),
                            ),
                        ],
                      ),
                    );
                  }),
                ],
              ),
            ),
          ),

          // 12. BOTTOM CONVERSION BANNER
          const SizedBox(height: 24),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [KijaniColors.emeraldDark, KijaniColors.emerald],
                ),
                borderRadius: BorderRadius.circular(22),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    '⚡ READY TO SHOP FRESH?',
                    style: TextStyle(
                      color: Color(0xFFA7F3D0),
                      fontSize: 10.5,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Fill Your Basket with Farm-Fresh Groceries Today',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 19,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Enjoy free express delivery, verified local produce, real-time tracking, and instant POS PDF receipts on every order.',
                    style: TextStyle(
                      color: Colors.white70,
                      fontSize: 12.5,
                      height: 1.4,
                    ),
                  ),
                  const SizedBox(height: 14),
                  Wrap(
                    spacing: 10,
                    runSpacing: 10,
                    children: [
                      ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.white,
                          foregroundColor: KijaniColors.emeraldDark,
                        ),
                        onPressed: () => widget.onNavigateProducts(),
                        icon: const Icon(Icons.shopping_cart_outlined, size: 16),
                        label: const Text(
                          'Start Shopping Now',
                          style: TextStyle(fontWeight: FontWeight.w800),
                        ),
                      ),
                      OutlinedButton.icon(
                        style: OutlinedButton.styleFrom(
                          foregroundColor: Colors.white,
                          side: const BorderSide(color: Colors.white54),
                        ),
                        onPressed: widget.onOpenSellerPortal,
                        icon: const Icon(Icons.storefront_outlined, size: 16),
                        label: const Text(
                          'Become a Seller',
                          style: TextStyle(fontWeight: FontWeight.w800),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeroStat(String value, String label) {
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            value,
            style: const TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w900,
              color: KijaniColors.slate900,
            ),
          ),
          Text(
            label,
            style: const TextStyle(
              fontSize: 11,
              color: KijaniColors.slate500,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStatDivider() {
    return Container(
      width: 1,
      height: 28,
      margin: const EdgeInsets.symmetric(horizontal: 10),
      color: KijaniColors.slate200,
    );
  }

  Widget _buildSectionHeader({
    required String eyebrow,
    required String title,
    required String actionLabel,
    required VoidCallback onAction,
  }) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  eyebrow,
                  style: const TextStyle(
                    fontSize: 10.5,
                    fontWeight: FontWeight.w800,
                    color: KijaniColors.emerald,
                    letterSpacing: 0.6,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 19,
                    fontWeight: FontWeight.w900,
                    color: KijaniColors.slate900,
                  ),
                ),
              ],
            ),
          ),
          InkWell(
            onTap: onAction,
            borderRadius: BorderRadius.circular(999),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: KijaniColors.emeraldLight,
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                actionLabel,
                style: const TextStyle(
                  fontSize: 11.5,
                  fontWeight: FontWeight.w800,
                  color: KijaniColors.emerald,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildProductGrid(
    List<Map<String, dynamic>> items, {
    bool showReason = false,
    bool showFlashTimer = false,
  }) {
    return GridView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: items.length,
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        mainAxisSpacing: 12,
        crossAxisSpacing: 12,
        childAspectRatio: 0.60,
      ),
      itemBuilder: (context, idx) {
        final prod = items[idx];
        return ProductCard(
          product: prod,
          showReason: showReason,
          showFlashTimer: showFlashTimer,
          onTap: () => widget.onOpenProductDetails(prod),
          onToggleWishlist: () => widget.onToggleWishlist(prod),
          onUpdateCartQty: (qty) => widget.onUpdateCartQty(prod, qty),
        );
      },
    );
  }

  Widget _buildSpotlightCard({
    required String eyebrow,
    required String title,
    required String desc,
    required String btnLabel,
    required List<Color> gradient,
    required VoidCallback onTap,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: gradient),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3.5),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.16),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(
              eyebrow,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 10,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            title,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 17.5,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 5),
          Text(
            desc,
            style: const TextStyle(
              color: Colors.white70,
              fontSize: 12,
              height: 1.4,
            ),
          ),
          const SizedBox(height: 12),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.white,
              foregroundColor: KijaniColors.emeraldDark,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(999),
              ),
            ),
            onPressed: onTap,
            child: Text(
              btnLabel,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildWhyCard(IconData icon, String title, String desc) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: KijaniColors.slate200),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: KijaniColors.emeraldLight,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, color: KijaniColors.emerald, size: 18),
            ),
            const SizedBox(height: 8),
            Text(
              title,
              style: const TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w800,
                color: KijaniColors.slate900,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              desc,
              style: const TextStyle(
                fontSize: 10.5,
                color: KijaniColors.slate500,
                height: 1.3,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
