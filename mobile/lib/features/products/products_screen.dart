import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import '../../core/config/api_endpoints.dart';
import '../../core/network/api_client.dart';
import '../../core/network/auth_session_manager.dart';
import '../../core/utils/app_utils.dart';
import '../../shared/widgets/shared_widgets.dart';

/// 1. Infinite-Scroll Products Catalog with Category Aisles, Search, and Live Flash-Sale Filter Banner
/// Matches client/src/pages/products/Products.js & Screenshots 2 & 10
class ProductsScreen extends StatefulWidget {
  final String? initialCategory;
  final String? initialSearch;
  final bool initialFlashOnly;
  final ValueChanged<Map<String, dynamic>> onOpenProductDetails;
  final void Function(Map<String, dynamic> product) onToggleWishlist;
  final void Function(Map<String, dynamic> product, int nextQty) onUpdateCartQty;

  const ProductsScreen({
    super.key,
    this.initialCategory,
    this.initialSearch,
    this.initialFlashOnly = false,
    required this.onOpenProductDetails,
    required this.onToggleWishlist,
    required this.onUpdateCartQty,
  });

  @override
  State<ProductsScreen> createState() => _ProductsScreenState();
}

class _ProductsScreenState extends State<ProductsScreen> {
  String? _category;
  String? _search;
  bool _flashOnly = false;

  List<Map<String, dynamic>> _products = [];
  int _currentPage = 1;
  int _totalPages = 1;
  bool _loadingInitial = false;
  bool _loadingMore = false;
  final ScrollController _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _category = widget.initialCategory;
    _search = widget.initialSearch;
    _flashOnly = widget.initialFlashOnly;
    _scrollController.addListener(_onScroll);
    _fetchFirstPage();
  }

  @override
  void didUpdateWidget(covariant ProductsScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.initialCategory != widget.initialCategory ||
        oldWidget.initialSearch != widget.initialSearch ||
        oldWidget.initialFlashOnly != widget.initialFlashOnly) {
      setState(() {
        _category = widget.initialCategory;
        _search = widget.initialSearch;
        _flashOnly = widget.initialFlashOnly;
      });
      _fetchFirstPage();
    }
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >=
            _scrollController.position.maxScrollExtent - 260 &&
        !_loadingMore &&
        !_loadingInitial &&
        _currentPage < _totalPages) {
      _fetchNextPage();
    }
  }

  String get _cacheKey =>
      'products_cat_${_category ?? 'ALL'}_s_${_search ?? ''}_f_$_flashOnly';

  Future<void> _fetchFirstPage({bool force = false}) async {
    final session = AuthSessionManager.instance;
    final cached = session.getCachedQuery<Map>(_cacheKey);
    if (cached != null) {
      final prods = (cached['products'] as List?)
              ?.map((e) => Map<String, dynamic>.from(e as Map))
              .toList() ??
          [];
      setState(() {
        _products = prods;
        _totalPages = (cached['total_pages'] as num?)?.toInt() ?? 1;
        _currentPage = 1;
      });
      if (!force && session.isQueryFresh(_cacheKey)) return;
    }

    if (_products.isEmpty) {
      setState(() => _loadingInitial = true);
    }

    try {
      final url = (_search != null && _search!.isNotEmpty)
          ? ApiEndpoints.productsSearch(_search!, 1)
          : ApiEndpoints.productsPerPage(
              1,
              category: _category,
              flash: _flashOnly,
            );
      final res = await ApiClient.instance.dio.get(url);
      if (res.data is Map) {
        final list = (res.data['products'] as List?)
                ?.map((e) => Map<String, dynamic>.from(e as Map))
                .toList() ??
            [];
        final totalPages = (res.data['total_pages'] as num?)?.toInt() ?? 1;
        await session.setCachedQuery(_cacheKey, {
          'products': list,
          'total_pages': totalPages,
        });
        if (mounted) {
          setState(() {
            _products = list;
            _totalPages = totalPages;
            _currentPage = 1;
          });
        }
      }
    } catch (_) {
    } finally {
      if (mounted) setState(() => _loadingInitial = false);
    }
  }

  Future<void> _fetchNextPage() async {
    if (_loadingMore || _currentPage >= _totalPages) return;
    setState(() => _loadingMore = true);
    final nextPage = _currentPage + 1;
    try {
      final url = (_search != null && _search!.isNotEmpty)
          ? ApiEndpoints.productsSearch(_search!, nextPage)
          : ApiEndpoints.productsPerPage(
              nextPage,
              category: _category,
              flash: _flashOnly,
            );
      final res = await ApiClient.instance.dio.get(url);
      if (res.data is Map && res.data['products'] is List) {
        final more = (res.data['products'] as List)
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList();
        if (mounted) {
          setState(() {
            _products = [..._products, ...more];
            _currentPage = nextPage;
          });
        }
      }
    } catch (_) {
    } finally {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final headingText = (_search != null && _search!.isNotEmpty)
        ? 'Search: "$_search"'
        : _flashOnly
            ? (_category != null
                ? '⚡ Flash Sales — $_category'
                : '⚡ Flash Sales & Discounts')
            : (_category ?? 'Products');

    return RefreshIndicator(
      color: KijaniColors.emerald,
      onRefresh: () => _fetchFirstPage(force: true),
      child: ListView(
        controller: _scrollController,
        padding: const EdgeInsets.only(top: 14, bottom: 40),
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Text(
                    headingText,
                    style: const TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w900,
                      color: KijaniColors.slate900,
                    ),
                  ),
                ),
                if (_search != null && _search!.isNotEmpty)
                  TextButton.icon(
                    onPressed: () {
                      setState(() => _search = null);
                      _fetchFirstPage();
                    },
                    icon: const Icon(Icons.close, size: 15),
                    label: const Text('Clear Search'),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 10),
          CategoryAisleStrip(
            selectedCategory: _category ?? 'All',
            onSelectCategory: (cat) {
              setState(() {
                _category = cat;
                _search = null;
              });
              _fetchFirstPage();
            },
          ),
          const SizedBox(height: 12),

          // Flash Sale Filter Strip / Active Obsidian-Emerald Banner with Live Countdown
          if (_search == null || _search!.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: _flashOnly
                  ? Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [
                            Color(0xFF064E3B),
                            Color(0xFF0F172A),
                          ],
                        ),
                        borderRadius: BorderRadius.circular(18),
                        boxShadow: [
                          BoxShadow(
                            color:
                                const Color(0xFF064E3B).withValues(alpha: 0.22),
                            blurRadius: 16,
                            offset: const Offset(0, 6),
                          ),
                        ],
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Expanded(
                                child: Text(
                                  '⚡ Flash Sales & Discounted Deals${_category != null ? ' • $_category' : ''}',
                                  style: const TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w900,
                                    color: Colors.white,
                                  ),
                                ),
                              ),
                              InkWell(
                                onTap: () {
                                  setState(() => _flashOnly = false);
                                  _fetchFirstPage();
                                },
                                child: Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 10,
                                    vertical: 5,
                                  ),
                                  decoration: BoxDecoration(
                                    color:
                                        Colors.white.withValues(alpha: 0.14),
                                    borderRadius: BorderRadius.circular(999),
                                    border: Border.all(
                                      color:
                                          Colors.white.withValues(alpha: 0.3),
                                    ),
                                  ),
                                  child: const Text(
                                    'Show All ✕',
                                    style: TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w800,
                                      color: Colors.white,
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 10),
                          StreamBuilder<int>(
                            stream: FlashCountdown.liveClockStream,
                            builder: (context, snapshot) {
                              final nowMs = snapshot.data ??
                                  DateTime.now().millisecondsSinceEpoch;
                              final soonestMs =
                                  FlashCountdown.getSoonestFlashSaleEndMs(
                                _products,
                                nowMs,
                              );
                              final rem = FlashCountdown.formatRemainingTime(
                                soonestMs,
                                nowMs,
                              );
                              return Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 11,
                                  vertical: 6,
                                ),
                                decoration: BoxDecoration(
                                  color: Colors.black.withValues(alpha: 0.35),
                                  borderRadius: BorderRadius.circular(999),
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    const Text(
                                      'NEXT DEAL ENDS IN  ',
                                      style: TextStyle(
                                        color: Color(0xFFA7F3D0),
                                        fontSize: 10,
                                        fontWeight: FontWeight.w800,
                                      ),
                                    ),
                                    Text(
                                      rem.toBannerClock(),
                                      style: const TextStyle(
                                        color: Color(0xFFFBBF24),
                                        fontFamily: 'monospace',
                                        fontSize: 12,
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
                    )
                  : Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Text(
                            '${_products.length} fresh items available',
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: KijaniColors.slate500,
                            ),
                          ),
                        ),
                        InkWell(
                          onTap: () {
                            setState(() => _flashOnly = true);
                            _fetchFirstPage();
                          },
                          borderRadius: BorderRadius.circular(999),
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 14,
                              vertical: 7,
                            ),
                            decoration: BoxDecoration(
                              gradient: const LinearGradient(
                                colors: [
                                  Color(0xFFFEF3C7),
                                  Color(0xFFFDE68A),
                                ],
                              ),
                              borderRadius: BorderRadius.circular(999),
                              border:
                                  Border.all(color: const Color(0xFFF59E0B)),
                            ),
                            child: const Text(
                              '⚡ Flash Deals Only',
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w900,
                                color: Color(0xFF92400E),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
            ),

          const SizedBox(height: 14),
          if (_loadingInitial && _products.isEmpty)
            const Padding(
              padding: EdgeInsets.all(40),
              child: Center(
                child: CircularProgressIndicator(color: KijaniColors.emerald),
              ),
            )
          else if (_products.isEmpty)
            const Padding(
              padding: EdgeInsets.all(40),
              child: Center(
                child: Text(
                  'No products found matching your selection.',
                  style: TextStyle(
                    fontSize: 14,
                    color: KijaniColors.slate500,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            )
          else ...[
            GridView.builder(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: _products.length,
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: 0.60,
              ),
              itemBuilder: (context, idx) {
                final prod = _products[idx];
                return ProductCard(
                  product: prod,
                  showFlashTimer:
                      _flashOnly || prod['flash_sale'] == true,
                  onTap: () => widget.onOpenProductDetails(prod),
                  onToggleWishlist: () => widget.onToggleWishlist(prod),
                  onUpdateCartQty: (qty) => widget.onUpdateCartQty(prod, qty),
                );
              },
            ),
            const SizedBox(height: 18),
            if (_loadingMore)
              const Center(
                child: Padding(
                  padding: EdgeInsets.all(12),
                  child: CircularProgressIndicator(color: KijaniColors.emerald),
                ),
              )
            else
              Center(
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 6,
                  ),
                  decoration: BoxDecoration(
                    color: KijaniColors.slate50,
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: KijaniColors.slate200),
                  ),
                  child: Text(
                    '✓ Showing all ${_products.length} products',
                    style: const TextStyle(
                      fontSize: 11.5,
                      fontWeight: FontWeight.w700,
                      color: KijaniColors.slate500,
                    ),
                  ),
                ),
              ),
          ],
        ],
      ),
    );
  }
}

/// 2. 0ms Cached Product Details Screen with Multi-Image Slider, Provenance Table,
/// 6-Card Nutritional Grid, Verified Buyer Reviews, and Active Dwell Time Telemetry.
/// Matches client/src/pages/product-details/ProductDetails.js & Screenshots 3 & 4.
class ProductDetailsScreen extends StatefulWidget {
  final String productId;
  final Map<String, dynamic>? initialPreview;
  final String? reviewOrderId;
  final VoidCallback onBack;
  final ValueChanged<Map<String, dynamic>> onSelectRelatedProduct;
  final void Function(Map<String, dynamic> product) onToggleWishlist;
  final void Function(Map<String, dynamic> product, int nextQty) onUpdateCartQty;

  const ProductDetailsScreen({
    super.key,
    required this.productId,
    this.initialPreview,
    this.reviewOrderId,
    required this.onBack,
    required this.onSelectRelatedProduct,
    required this.onToggleWishlist,
    required this.onUpdateCartQty,
  });

  @override
  State<ProductDetailsScreen> createState() => _ProductDetailsScreenState();
}

class _ProductDetailsScreenState extends State<ProductDetailsScreen> {
  Map<String, dynamic>? _product;
  Map<String, dynamic>? _eligibility;
  int _activeImageIdx = 0;
  bool _loading = false;
  late DateTime _openedAt;

  int _productRating = 5;
  int _sellerRating = 5;
  final _commentCtrl = TextEditingController();
  bool _submittingReview = false;
  String _reviewMsg = '';
  String _reviewErr = '';

  @override
  void initState() {
    super.initState();
    _openedAt = DateTime.now();
    // 0ms Instant Preview from card or SWR cache
    _product = widget.initialPreview ??
        AuthSessionManager.instance.findCachedProductPreview(widget.productId);
    _fetchFullDetails();
  }

  @override
  void dispose() {
    final dwellMs = DateTime.now().difference(_openedAt).inMilliseconds;
    if (_product != null && dwellMs >= 2000) {
      ApiClient.instance.trackInteraction(
        eventType: 'DWELL',
        productId: widget.productId,
        category: _product?['category']?.toString(),
        dwellMs: dwellMs.clamp(2000, 300000),
      );
    }
    _commentCtrl.dispose();
    super.dispose();
  }

  Future<void> _fetchFullDetails() async {
    if (_product == null) setState(() => _loading = true);
    try {
      final res = await ApiClient.instance.dio.get(
        ApiEndpoints.productById(widget.productId),
      );
      if (res.data is Map) {
        final full = Map<String, dynamic>.from(res.data as Map);
        ApiClient.instance.trackInteraction(
          eventType: 'VIEW',
          productId: widget.productId,
          category: full['category']?.toString(),
        );
        if (mounted) setState(() => _product = full);
      }

      if (AuthSessionManager.instance.customerSession != null) {
        final eligRes = await ApiClient.instance.dio.get(
          ApiEndpoints.reviewEligibility(
            widget.productId,
            orderId: widget.reviewOrderId,
          ),
        );
        if (eligRes.data is Map && mounted) {
          final elig = Map<String, dynamic>.from(eligRes.data as Map);
          setState(() {
            _eligibility = elig;
            if (elig['existingReview'] is Map) {
              final ex = elig['existingReview'] as Map;
              _productRating = (ex['product_rating'] as num?)?.toInt() ?? 5;
              _sellerRating = (ex['seller_rating'] as num?)?.toInt() ?? 5;
              _commentCtrl.text = (ex['comment'] ?? '').toString();
            }
          });
        }
      }
    } catch (_) {
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _submitReview() async {
    if (_commentCtrl.text.trim().length < 3) {
      setState(() => _reviewErr = 'Please write a brief review comment.');
      return;
    }
    setState(() {
      _submittingReview = true;
      _reviewErr = '';
      _reviewMsg = '';
    });
    try {
      final res = await ApiClient.instance.dio.post(
        ApiEndpoints.productReviews(widget.productId),
        data: {
          'product_rating': _productRating,
          'seller_rating': _sellerRating,
          'comment': _commentCtrl.text.trim(),
          'order_id': _eligibility?['eligibleOrderId'] ?? widget.reviewOrderId,
        },
      );
      setState(() {
        _reviewMsg = (res.data is Map && res.data['message'] != null)
            ? res.data['message'].toString()
            : '✓ Thank you! Your verified review has been saved.';
      });
      await _fetchFullDetails();
    } on DioException catch (e) {
      setState(() {
        _reviewErr = (e.response?.data is Map
                ? e.response?.data['message']?.toString()
                : e.message) ??
            'Failed to submit review.';
      });
    } finally {
      if (mounted) setState(() => _submittingReview = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading && _product == null) {
      return const Center(
        child: CircularProgressIndicator(color: KijaniColors.emerald),
      );
    }
    final prod = _product;
    if (prod == null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text('Product not found.'),
            TextButton(onPressed: widget.onBack, child: const Text('← Go Back')),
          ],
        ),
      );
    }

    final images = <String>[
      if (prod['image'] != null && prod['image'].toString().isNotEmpty)
        prod['image'].toString(),
      if (prod['images'] is List)
        ...(prod['images'] as List).map((e) => e.toString()),
    ].toSet().toList();

    final currentImg = images.isNotEmpty
        ? images[_activeImageIdx.clamp(0, images.length - 1)]
        : '';

    final discountPct = PricingUtils.getDiscountPercent(prod);
    final originalPrice = PricingUtils.getOriginalPrice(prod);
    final effectivePrice = PricingUtils.getEffectivePrice(prod);
    final stock = (prod['stock'] as num?)?.toInt() ?? 0;
    final rating = ((prod['rating'] as num?) ?? 4.8).toDouble();
    final reviews = (prod['reviews'] as List?)
            ?.map((e) => Map<String, dynamic>.from(e as Map))
            .toList() ??
        [];
    final related = (prod['related_products'] as List?)
            ?.map((e) => Map<String, dynamic>.from(e as Map))
            .toList() ??
        [];
    final nutrition = prod['nutrition'] is Map
        ? Map<String, dynamic>.from(prod['nutrition'] as Map)
        : <String, dynamic>{};
    final seller = prod['seller'] is Map
        ? Map<String, dynamic>.from(prod['seller'] as Map)
        : <String, dynamic>{};

    final qtyInCart =
        AuthSessionManager.instance.getProductQuantityInCart(widget.productId);
    final isWishlisted = AuthSessionManager.instance.customerSession?.wishlist
            .contains(widget.productId) ??
        false;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 40),
      children: [
        // Breadcrumb & Back
        Row(
          children: [
            TextButton.icon(
              onPressed: widget.onBack,
              icon: const Icon(Icons.arrow_back_rounded, size: 17),
              label: Text(prod['category']?.toString() ?? 'Back to Products'),
            ),
          ],
        ),

        // 1. Multi-Image Gallery Slider + Thumbnails
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: KijaniColors.slate200),
          ),
          child: Column(
            children: [
              SizedBox(
                height: 230,
                width: double.infinity,
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(16),
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      Container(
                        color: const Color(0xFFF1F5F9),
                        child: currentImg.isNotEmpty
                            ? Image.network(
                                currentImg,
                                fit: BoxFit.cover,
                                width: double.infinity,
                                height: double.infinity,
                              )
                            : const Center(
                                child: Icon(
                                  Icons.shopping_basket_outlined,
                                  size: 72,
                                  color: KijaniColors.emerald,
                                ),
                              ),
                      ),
                      if (discountPct > 0)
                        Positioned(
                          top: 10,
                          left: 10,
                          child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: prod['flash_sale'] == true
                                ? KijaniColors.amber
                                : KijaniColors.danger,
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(
                            prod['flash_sale'] == true
                                ? '⚡ Flash Sale · $discountPct% Off'
                                : '$discountPct% Off',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 11,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                      ),
                    if (images.length > 1)
                      Positioned(
                        bottom: 4,
                        right: 4,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 3,
                          ),
                          decoration: BoxDecoration(
                            color: KijaniColors.slate900.withOpacity(0.75),
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(
                            '${_activeImageIdx + 1} / ${images.length}',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              if (images.length > 1) ...[
                const SizedBox(height: 10),
                SizedBox(
                  height: 54,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: images.length,
                    separatorBuilder: (_, __) => const SizedBox(width: 8),
                    itemBuilder: (context, idx) => GestureDetector(
                      onTap: () => setState(() => _activeImageIdx = idx),
                      child: Container(
                        width: 54,
                        padding: const EdgeInsets.all(4),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                            color: idx == _activeImageIdx
                                ? KijaniColors.emerald
                                : KijaniColors.slate200,
                            width: idx == _activeImageIdx ? 2 : 1,
                          ),
                        ),
                        child: Image.network(images[idx], fit: BoxFit.contain),
                      ),
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 16),

        // 2. Main Specs, Price, Add-to-Cart & Provenance Table (Screenshot 4)
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: KijaniColors.slate200),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${(prod['brand'] ?? 'KIJANIMART ORGANICS').toString().toUpperCase()} · SKU ${prod['sku'] ?? prod['product_id']}',
                style: const TextStyle(
                  fontSize: 10.5,
                  fontWeight: FontWeight.w800,
                  color: KijaniColors.slate500,
                  letterSpacing: 0.5,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                (prod['name'] ?? '').toString(),
                style: const TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w900,
                  color: KijaniColors.slate900,
                ),
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 10,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  Text(
                    '★ ${rating.toStringAsFixed(1)} (${prod['reviews_count'] ?? reviews.length} reviews)',
                    style: const TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w800,
                      color: Color(0xFFB45309),
                    ),
                  ),
                  Text(
                    '${prod['weight'] ?? ''} ${prod['measurement'] ?? ''}',
                    style: const TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w700,
                      color: KijaniColors.slate500,
                    ),
                  ),
                  Text(
                    stock > 0 ? 'In stock ($stock)' : 'Out of stock',
                    style: TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w800,
                      color: stock > 0
                          ? KijaniColors.emerald
                          : KijaniColors.danger,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Wrap(
                crossAxisAlignment: WrapCrossAlignment.end,
                spacing: 10,
                runSpacing: 4,
                children: [
                  Text(
                    'KES ${PricingUtils.formatKES(effectivePrice)}',
                    style: const TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.w900,
                      color: KijaniColors.slate900,
                    ),
                  ),
                  if (discountPct > 0)
                    Text(
                      'KES ${PricingUtils.formatKES(originalPrice)}',
                      style: const TextStyle(
                        fontSize: 14,
                        color: KijaniColors.slate500,
                        decoration: TextDecoration.lineThrough,
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                (prod['description'] ??
                        'Freshly harvested and quality-checked by KijaniMart.')
                    .toString(),
                style: const TextStyle(
                  fontSize: 13,
                  color: KijaniColors.slate700,
                  height: 1.5,
                ),
              ),
              const SizedBox(height: 16),

              // Add to Cart + Wishlist Action Bar
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: KijaniColors.slate900,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      onPressed: stock <= 0
                          ? null
                          : () => widget.onUpdateCartQty(prod, qtyInCart + 1),
                      child: Text(
                        stock <= 0
                            ? 'Out of Stock'
                            : qtyInCart > 0
                                ? 'In Cart ($qtyInCart) — Add Another • KES ${PricingUtils.formatKES(effectivePrice)}'
                                : 'Add to Cart — KES ${PricingUtils.formatKES(effectivePrice)}',
                        style: const TextStyle(
                          fontSize: 13.5,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  InkWell(
                    onTap: () => widget.onToggleWishlist(prod),
                    borderRadius: BorderRadius.circular(12),
                    child: Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: KijaniColors.slate200),
                      ),
                      child: Icon(
                        isWishlisted
                            ? Icons.favorite_rounded
                            : Icons.favorite_border_rounded,
                        color: isWishlisted
                            ? const Color(0xFFE11D48)
                            : KijaniColors.slate700,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              const Divider(),

              // 4-Row Provenance Table
              _buildSpecRow(
                'Seller',
                '${seller['name'] ?? 'KijaniMart Verified Farm'} (${seller['location'] ?? 'Nairobi, Kenya'}) · ★ ${seller['rating'] ?? 4.8}',
              ),
              _buildSpecRow(
                'Origin',
                (prod['origin'] ?? 'Kenyan Highlands').toString(),
              ),
              _buildSpecRow(
                'Packed / Harvested',
                prod['harvest_date'] != null
                    ? prod['harvest_date'].toString().split('T').first
                    : 'Fresh Daily Harvest',
              ),
              _buildSpecRow(
                'Shelf Life & Storage',
                '${prod['shelf_life_days'] ?? 7} Days · ${prod['storage_instructions'] ?? 'Keep cool and dry.'}',
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),

        // 3. 6-Card Nutritional Information Grid (Screenshot 3)
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: KijaniColors.slate200),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Nutritional Information',
                style: TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w900,
                  color: KijaniColors.slate900,
                ),
              ),
              const SizedBox(height: 12),
              GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: 8,
                crossAxisSpacing: 8,
                childAspectRatio: 2.3,
                children: [
                  _buildMacroCell(
                    'Calories',
                    (nutrition['calories'] ?? '52 kcal / 100g').toString(),
                  ),
                  _buildMacroCell(
                    'Protein',
                    (nutrition['protein'] ?? '2.4g').toString(),
                  ),
                  _buildMacroCell(
                    'Carbohydrates',
                    (nutrition['carbs'] ?? '9.8g').toString(),
                  ),
                  _buildMacroCell(
                    'Total Fat',
                    (nutrition['fat'] ?? '0.4g').toString(),
                  ),
                  _buildMacroCell(
                    'Dietary Fiber',
                    (nutrition['fiber'] ?? '3.2g').toString(),
                  ),
                  _buildMacroCell(
                    'Micronutrients',
                    (nutrition['vitamins'] ?? 'Vitamin A, Vitamin C, Iron')
                        .toString(),
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),

        // 4. Customer Reviews & Verified Deliveries Review Form (Screenshot 3)
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: KijaniColors.slate200),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Expanded(
                    child: Text(
                      'Customer Reviews',
                      style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w900,
                        color: KijaniColors.slate900,
                      ),
                    ),
                  ),
                  Text(
                    '${rating.toStringAsFixed(1)} ★ (${reviews.length} verified)',
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w900,
                      color: KijaniColors.slate900,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),

              // Verified Deliveries Review Form or Notice
              if (_eligibility?['canReview'] == true)
                Container(
                  margin: const EdgeInsets.only(bottom: 14),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: KijaniColors.emeraldLight,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: KijaniColors.emeraldBorder),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '✓ Verified Delivery (Order #${_eligibility?['eligibleOrderId']}) — Rate Product & Seller',
                        style: const TextStyle(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w800,
                          color: KijaniColors.emeraldDark,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        crossAxisAlignment: WrapCrossAlignment.center,
                        spacing: 4,
                        runSpacing: 6,
                        children: [
                          const Text(
                            'Product: ',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          ...List.generate(
                            5,
                            (i) => IconButton(
                              visualDensity: VisualDensity.compact,
                              padding: EdgeInsets.zero,
                              constraints: const BoxConstraints(),
                              onPressed: () =>
                                  setState(() => _productRating = i + 1),
                              icon: Icon(
                                i < _productRating
                                    ? Icons.star_rounded
                                    : Icons.star_border_rounded,
                                color: KijaniColors.amber,
                                size: 22,
                              ),
                            ),
                          ),
                          const SizedBox(width: 14),
                          const Text(
                            'Seller: ',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          ...List.generate(
                            5,
                            (i) => IconButton(
                              visualDensity: VisualDensity.compact,
                              padding: EdgeInsets.zero,
                              constraints: const BoxConstraints(),
                              onPressed: () =>
                                  setState(() => _sellerRating = i + 1),
                              icon: Icon(
                                i < _sellerRating
                                    ? Icons.star_rounded
                                    : Icons.star_border_rounded,
                                color: KijaniColors.amber,
                                size: 22,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      TextField(
                        controller: _commentCtrl,
                        maxLines: 2,
                        decoration: const InputDecoration(
                          hintText:
                              'Share your experience with freshness & delivery...',
                          filled: true,
                          fillColor: Colors.white,
                          border: OutlineInputBorder(),
                        ),
                      ),
                      if (_reviewErr.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 6),
                          child: Text(
                            _reviewErr,
                            style: const TextStyle(
                              color: KijaniColors.danger,
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      if (_reviewMsg.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 6),
                          child: Text(
                            _reviewMsg,
                            style: const TextStyle(
                              color: KijaniColors.emeraldDark,
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      const SizedBox(height: 8),
                      ElevatedButton(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: KijaniColors.emerald,
                          foregroundColor: Colors.white,
                        ),
                        onPressed: _submittingReview ? null : _submitReview,
                        child: Text(
                          _submittingReview
                              ? 'Submitting...'
                              : 'Submit Verified Review',
                        ),
                      ),
                    ],
                  ),
                )
              else
                Container(
                  margin: const EdgeInsets.only(bottom: 14),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: KijaniColors.slate50,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: KijaniColors.slate200),
                  ),
                  child: const Text(
                    'Verified Deliveries Only: To keep reviews authentic, ratings can only be submitted after you order this product and your order is marked Delivered.',
                    style: TextStyle(
                      fontSize: 11.5,
                      color: KijaniColors.slate500,
                      height: 1.4,
                    ),
                  ),
                ),

              ...reviews.map(
                (rev) => Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    border: Border(
                      bottom: BorderSide(color: KijaniColors.slate200),
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Expanded(
                            child: Wrap(
                              spacing: 6,
                              crossAxisAlignment: WrapCrossAlignment.center,
                              children: [
                                Text(
                                  (rev['user_name'] ?? 'Verified Buyer')
                                      .toString(),
                                  style: const TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w800,
                                    color: KijaniColors.slate900,
                                  ),
                                ),
                                const Text(
                                  'Verified Delivery',
                                  style: TextStyle(
                                    fontSize: 10.5,
                                    fontWeight: FontWeight.w800,
                                    color: KijaniColors.emerald,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          Text(
                            '${'★' * ((rev['product_rating'] as num?)?.toInt() ?? 5)}  Seller: ${rev['seller_rating'] ?? 5}/5',
                            style: const TextStyle(
                              fontSize: 11,
                              color: KijaniColors.amber,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        (rev['comment'] ?? '').toString(),
                        style: const TextStyle(
                          fontSize: 12.5,
                          color: KijaniColors.slate700,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),

        // 5. Related Products Shelf
        if (related.isNotEmpty) ...[
          const SizedBox(height: 22),
          const Text(
            'You May Also Like',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w900,
              color: KijaniColors.slate900,
            ),
          ),
          const SizedBox(height: 10),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: related.length,
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              childAspectRatio: 0.60,
            ),
            itemBuilder: (context, idx) {
              final rProd = related[idx];
              return ProductCard(
                product: rProd,
                onTap: () => widget.onSelectRelatedProduct(rProd),
                onToggleWishlist: () => widget.onToggleWishlist(rProd),
                onUpdateCartQty: (qty) => widget.onUpdateCartQty(rProd, qty),
              );
            },
          ),
        ],
      ],
    );
  }

  Widget _buildSpecRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 110,
            child: Text(
              label,
              style: const TextStyle(
                fontSize: 12,
                color: KijaniColors.slate500,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(
                fontSize: 12.5,
                color: KijaniColors.slate900,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMacroCell(String label, String value) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: KijaniColors.slate50,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: KijaniColors.slate200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            label,
            style: const TextStyle(
              fontSize: 10.5,
              color: KijaniColors.slate500,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 12.5,
              color: KijaniColors.slate900,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}

/// 3. User-Scoped Self-Healing Wishlist Screen (Matches client/src/pages/wishlist/Wishlist.js & Screenshot 6)
class WishlistScreen extends StatefulWidget {
  final ValueChanged<Map<String, dynamic>> onOpenProductDetails;
  final void Function(Map<String, dynamic> product) onToggleWishlist;
  final void Function(Map<String, dynamic> product, int nextQty) onUpdateCartQty;
  final VoidCallback onExploreProducts;

  const WishlistScreen({
    super.key,
    required this.onOpenProductDetails,
    required this.onToggleWishlist,
    required this.onUpdateCartQty,
    required this.onExploreProducts,
  });

  @override
  State<WishlistScreen> createState() => _WishlistScreenState();
}

class _WishlistScreenState extends State<WishlistScreen> {
  List<Map<String, dynamic>> _products = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _fetchWishlist();
  }

  Future<void> _fetchWishlist() async {
    final userId = AuthSessionManager.instance.customerSession?.userId;
    if (userId == null || userId.isEmpty) {
      setState(() {
        _products = [];
        _loading = false;
      });
      return;
    }

    setState(() => _loading = true);
    try {
      final res = await ApiClient.instance.dio.get(ApiEndpoints.wishlist);
      if (res.data is List) {
        final list = (res.data as List)
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList();
        final validIds = list
            .map((p) => p['product_id']?.toString() ?? '')
            .where((id) => id.isNotEmpty)
            .toList();
        // Self-healing sync: prune any deleted/stale product IDs from local user profile
        await AuthSessionManager.instance.updateWishlistIds(validIds);
        if (mounted) setState(() => _products = list);
      }
    } catch (_) {
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(
        child: CircularProgressIndicator(color: KijaniColors.emerald),
      );
    }
    return RefreshIndicator(
      color: KijaniColors.emerald,
      onRefresh: _fetchWishlist,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 40),
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'SAVED FAVORITES',
                      style: TextStyle(
                        fontSize: 10.5,
                        fontWeight: FontWeight.w800,
                        color: KijaniColors.emerald,
                      ),
                    ),
                    Text(
                      'My Wishlist ${_products.isNotEmpty ? '(${_products.length})' : ''}',
                      style: const TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w900,
                        color: KijaniColors.slate900,
                      ),
                    ),
                  ],
                ),
              ),
              TextButton(
                onPressed: widget.onExploreProducts,
                child: const Text('Explore All Aisles →'),
              ),
            ],
          ),
          const SizedBox(height: 16),
          if (_products.isEmpty)
            Container(
              padding: const EdgeInsets.all(28),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: KijaniColors.slate200),
              ),
              child: Column(
                children: [
                  Container(
                    width: 56,
                    height: 56,
                    decoration: BoxDecoration(
                      color: const Color(0xFFFFE4E6),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: const Icon(
                      Icons.favorite_rounded,
                      color: Color(0xFFE11D48),
                      size: 28,
                    ),
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'No saved favorites yet',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w900,
                      color: KijaniColors.slate900,
                    ),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Tap the heart icon on any product card to save your favorite groceries for quick reordering.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 12.5,
                      color: KijaniColors.slate500,
                    ),
                  ),
                  const SizedBox(height: 14),
                  ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: KijaniColors.emerald,
                      foregroundColor: Colors.white,
                    ),
                    onPressed: widget.onExploreProducts,
                    icon: const Text('Explore Fresh Products'),
                    label: const Icon(Icons.arrow_forward_rounded, size: 16),
                  ),
                ],
              ),
            )
          else
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: _products.length,
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: 0.60,
              ),
              itemBuilder: (context, idx) {
                final prod = _products[idx];
                return ProductCard(
                  product: prod,
                  onTap: () => widget.onOpenProductDetails(prod),
                  onToggleWishlist: () {
                    widget.onToggleWishlist(prod);
                    setState(() {
                      _products.removeWhere(
                        (p) => p['product_id'] == prod['product_id'],
                      );
                    });
                  },
                  onUpdateCartQty: (qty) => widget.onUpdateCartQty(prod, qty),
                );
              },
            ),
        ],
      ),
    );
  }
}
