import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'core/config/api_endpoints.dart';
import 'core/network/api_client.dart';
import 'core/network/auth_session_manager.dart';
import 'features/admin/admin_console_screen.dart';
import 'features/auth/auth_screens.dart';
import 'features/cart_checkout/cart_checkout_screens.dart';
import 'features/home/home_screen.dart';
import 'features/orders_shipping/orders_shipping_screens.dart';
import 'features/privacy/privacy_notice_screen.dart';
import 'features/products/products_screen.dart';
import 'features/profile/profile_notifications_screens.dart';
import 'features/seller/seller_portal_screen.dart';
import 'shared/widgets/shared_widgets.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Future.wait([
    AuthSessionManager.instance.init(),
    ApiEndpoints.autoSelectBestBackend(),
  ]);
  runApp(const KijaniMartMobileApp());
}

class KijaniMartMobileApp extends StatelessWidget {
  const KijaniMartMobileApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'KijaniMart | Fresh Highland Groceries in 20 Mins',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        scaffoldBackgroundColor: KijaniColors.slate50,
        colorScheme: ColorScheme.fromSeed(
          seedColor: KijaniColors.emerald,
          primary: KijaniColors.emerald,
        ),
      ),
      home: const KijaniMartMainShell(),
    );
  }
}

class KijaniMartMainShell extends StatefulWidget {
  const KijaniMartMainShell({super.key});

  @override
  State<KijaniMartMainShell> createState() => _KijaniMartMainShellState();
}

class _KijaniMartMainShellState extends State<KijaniMartMainShell> {
  // Active View: 'home' | 'products' | 'product_details' | 'cart' | 'checkout' |
  // 'orders' | 'order_details' | 'wishlist' | 'profile' | 'notifications' |
  // 'privacy' | 'login' | 'admin' | 'seller'
  String _activeView = 'home';
  String? _selectedCategory;
  String? _searchQuery;
  bool _flashOnly = false;
  Map<String, dynamic>? _activeProductPreview;
  String _activeProductId = '';
  String _activeOrderId = '';
  int _unreadNotifs = 0;

  final _searchCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _hydrateBackgroundProfileCartAndNotifs();
  }

  Future<void> _hydrateBackgroundProfileCartAndNotifs() async {
    final session = AuthSessionManager.instance.customerSession;
    if (session == null) return;

    try {
      final results = await Future.wait([
        ApiClient.instance.dio.get(ApiEndpoints.profile),
        ApiClient.instance.dio.get(ApiEndpoints.cart),
        ApiClient.instance.dio.get(
          ApiEndpoints.notifications(
            scope: session.isAdmin ? 'all' : 'mine',
            limit: 40,
          ),
        ),
      ]);

      if (results[0].data is Map && results[0].data['user'] is Map) {
        await AuthSessionManager.instance.updateUserFields(
          Map<String, dynamic>.from(results[0].data['user'] as Map),
        );
      }
      if (results[1].data is Map && results[1].data['cart'] is List) {
        final serverCart = (results[1].data['cart'] as List)
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList();
        await AuthSessionManager.instance.setCart(serverCart);
      }
      if (results[2].data is Map) {
        final notifs = results[2].data as Map;
        if (mounted) {
          setState(() {
            _unreadNotifs = (notifs['unread_count'] as num?)?.toInt() ?? 0;
          });
        }
      }
    } catch (_) {}
  }

  Future<void> _toggleWishlist(Map<String, dynamic> product) async {
    final session = AuthSessionManager.instance.customerSession;
    if (session == null) {
      setState(() => _activeView = 'login');
      return;
    }
    final pid = (product['product_id'] ?? '').toString();
    if (pid.isEmpty) return;

    final current = List<String>.from(session.wishlist);
    if (current.contains(pid)) {
      current.remove(pid);
    } else {
      current.add(pid);
      ApiClient.instance.trackInteraction(
        eventType: 'WISHLIST_ADD',
        productId: pid,
        category: product['category']?.toString(),
      );
    }
    await AuthSessionManager.instance.updateWishlistIds(current);

    try {
      final res = await ApiClient.instance.dio.patch(
        ApiEndpoints.wishlist,
        data: {'product_id': pid},
      );
      if (res.data is Map && res.data['wishlist'] is List) {
        final synced =
            (res.data['wishlist'] as List).map((e) => e.toString()).toList();
        await AuthSessionManager.instance.updateWishlistIds(synced);
      }
    } catch (_) {}
  }

  Future<void> _updateCartQty(Map<String, dynamic> product, int nextQty) async {
    final session = AuthSessionManager.instance.customerSession;
    if (session == null) {
      setState(() => _activeView = 'login');
      return;
    }
    final pid = (product['product_id'] ?? '').toString();
    if (pid.isEmpty) return;
    final maxStock = (product['stock'] as num?)?.toInt() ?? 999;

    final currentCart =
        List<Map<String, dynamic>>.from(AuthSessionManager.instance.cart);
    final idx = currentCart.indexWhere((c) => c['product_id'] == pid);

    if (nextQty <= 0) {
      if (idx >= 0) currentCart.removeAt(idx);
    } else {
      final capped = nextQty.clamp(1, maxStock);
      if (idx >= 0) {
        currentCart[idx] = {...currentCart[idx], ...product, 'quantity': capped};
      } else {
        currentCart.add({...product, 'quantity': capped});
        ApiClient.instance.trackInteraction(
          eventType: 'CART_ADD',
          productId: pid,
          category: product['category']?.toString(),
          quantity: capped,
        );
      }
    }

    await AuthSessionManager.instance.setCart(
      currentCart,
      onSyncServer: (cartToSync) {
        ApiClient.instance.dio
            .put(ApiEndpoints.cart, data: {'cart': cartToSync})
            .catchError((_) => Response(requestOptions: RequestOptions()));
      },
    );
  }

  int get _bottomNavIndex {
    switch (_activeView) {
      case 'products':
      case 'product_details':
        return 1;
      case 'cart':
      case 'checkout':
        return 2;
      case 'orders':
      case 'order_details':
        return 3;
      case 'profile':
      case 'wishlist':
      case 'notifications':
      case 'privacy':
      case 'login':
      case 'admin':
        return 4;
      case 'home':
      default:
        return 0;
    }
  }

  bool get _showSearchBar =>
      _activeView == 'home' || _activeView == 'products';

  void _submitSearch(String raw) {
    final q = raw.trim();
    if (q.isNotEmpty) {
      ApiClient.instance.trackInteraction(
        eventType: 'SEARCH',
        searchQuery: q,
      );
    }
    FocusScope.of(context).unfocus();
    setState(() {
      _searchQuery = q.isEmpty ? null : q;
      _selectedCategory = null;
      _flashOnly = false;
      _activeView = 'products';
    });
  }

  void _onDockSelected(int idx, AuthSessionData? session) {
    setState(() {
      switch (idx) {
        case 0:
          _activeView = 'home';
          break;
        case 1:
          _selectedCategory = null;
          _searchQuery = null;
          _flashOnly = false;
          _activeView = 'products';
          break;
        case 2:
          if (session != null) {
            _hydrateBackgroundProfileCartAndNotifs();
          }
          _activeView = session != null ? 'cart' : 'login';
          break;
        case 3:
          _activeView = session != null ? 'orders' : 'login';
          break;
        case 4:
          _activeView = session != null ? 'profile' : 'login';
          break;
      }
    });
  }

  Widget _glassHeaderButton({
    required IconData icon,
    required String tooltip,
    required VoidCallback onTap,
    int badgeCount = 0,
    Color badgeColor = const Color(0xFFF59E0B),
  }) {
    return Padding(
      padding: const EdgeInsets.only(left: 6),
      child: Tooltip(
        message: tooltip,
        child: InkWell(
          onTap: onTap,
          customBorder: const CircleBorder(),
          child: Container(
            width: 38,
            height: 38,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.14),
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white.withValues(alpha: 0.22)),
            ),
            child: Badge(
              isLabelVisible: badgeCount > 0,
              label: Text('$badgeCount'),
              backgroundColor: badgeColor,
              child: Icon(icon, color: Colors.white, size: 19),
            ),
          ),
        ),
      ),
    );
  }

  /// Deep-Emerald Super-App Header with context-aware search
  /// (search is only shown on Home & Shop Aisles).
  PreferredSizeWidget _buildHeader(AuthSessionData? session) {
    final showSearch = _showSearchBar;
    return PreferredSize(
      preferredSize: Size.fromHeight(showSearch ? 128 : 70),
      child: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              Color(0xFF064E3B),
              Color(0xFF047857),
              Color(0xFF059669),
            ],
          ),
          borderRadius: BorderRadius.vertical(bottom: Radius.circular(26)),
          boxShadow: [
            BoxShadow(
              color: Color(0x2E064E3B),
              blurRadius: 18,
              offset: Offset(0, 6),
            ),
          ],
        ),
        child: SafeArea(
          bottom: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 8, 12, 12),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onTap: () => setState(() => _activeView = 'home'),
                        child: Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.all(3),
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: const KijaniLogoBadge(size: 32),
                            ),
                            const SizedBox(width: 10),
                            const Flexible(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Text(
                                    'KijaniMart',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      color: Colors.white,
                                      fontSize: 17,
                                      fontWeight: FontWeight.w900,
                                      letterSpacing: -0.2,
                                    ),
                                  ),
                                  SizedBox(height: 1),
                                  Row(
                                    children: [
                                      Icon(
                                        Icons.bolt_rounded,
                                        size: 13,
                                        color: Color(0xFFFBBF24),
                                      ),
                                      SizedBox(width: 2),
                                      Flexible(
                                        child: Text(
                                          '20-Min Express • Nairobi',
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: TextStyle(
                                            color: Color(0xFFD1FAE5),
                                            fontSize: 10.5,
                                            fontWeight: FontWeight.w700,
                                          ),
                                        ),
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
                    if (session?.isAdmin == true)
                      Padding(
                        padding: const EdgeInsets.only(left: 6),
                        child: InkWell(
                          onTap: () => setState(() => _activeView = 'admin'),
                          borderRadius: BorderRadius.circular(999),
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 10,
                              vertical: 6,
                            ),
                            decoration: BoxDecoration(
                              color: const Color(0xFFFBBF24),
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: const Text(
                              'Admin',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w900,
                                color: Color(0xFF78350F),
                              ),
                            ),
                          ),
                        ),
                      ),
                    if (session != null)
                      _glassHeaderButton(
                        icon: Icons.notifications_none_rounded,
                        tooltip: 'Notifications',
                        badgeCount: _unreadNotifs,
                        onTap: () =>
                            setState(() => _activeView = 'notifications'),
                      ),
                    if (session != null)
                      _glassHeaderButton(
                        icon: Icons.favorite_border_rounded,
                        tooltip: 'My Wishlist',
                        badgeCount: session.wishlist.length,
                        badgeColor: const Color(0xFFE11D48),
                        onTap: () => setState(() => _activeView = 'wishlist'),
                      ),
                    _glassHeaderButton(
                      icon: Icons.storefront_rounded,
                      tooltip: 'KijaniMart Seller Center',
                      onTap: () => setState(() => _activeView = 'seller'),
                    ),
                  ],
                ),
                if (showSearch) ...[
                  const SizedBox(height: 12),
                  SizedBox(
                    height: 46,
                    child: TextField(
                      controller: _searchCtrl,
                      textInputAction: TextInputAction.search,
                      onSubmitted: _submitSearch,
                      style: const TextStyle(
                        fontSize: 13.5,
                        fontWeight: FontWeight.w600,
                      ),
                      decoration: InputDecoration(
                        hintText: 'Search kale, milk, fruits, chicken...',
                        hintStyle: const TextStyle(
                          fontSize: 13,
                          color: KijaniColors.slate500,
                        ),
                        prefixIcon: const Icon(
                          Icons.search_rounded,
                          color: KijaniColors.emerald,
                          size: 21,
                        ),
                        suffixIcon: Padding(
                          padding: const EdgeInsets.all(5),
                          child: Material(
                            color: KijaniColors.emerald,
                            borderRadius: BorderRadius.circular(12),
                            child: InkWell(
                              borderRadius: BorderRadius.circular(12),
                              onTap: () => _submitSearch(_searchCtrl.text),
                              child: const SizedBox(
                                width: 38,
                                child: Icon(
                                  Icons.arrow_forward_rounded,
                                  color: Colors.white,
                                  size: 19,
                                ),
                              ),
                            ),
                          ),
                        ),
                        filled: true,
                        fillColor: Colors.white,
                        contentPadding: EdgeInsets.zero,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(16),
                          borderSide: BorderSide.none,
                        ),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: AuthSessionManager.instance,
      builder: (context, _) {
        final session = AuthSessionManager.instance.customerSession;
        final isSellerView = _activeView == 'seller';

        return AnnotatedRegion<SystemUiOverlayStyle>(
          value: isSellerView
              ? SystemUiOverlayStyle.dark
              : SystemUiOverlayStyle.light,
          child: Scaffold(
            backgroundColor: KijaniColors.slate50,
            appBar: isSellerView ? null : _buildHeader(session),
            body: SafeArea(
              child: Stack(
                fit: StackFit.expand,
                children: [
                  _buildActiveView(session),
                  if (!isSellerView && _activeView != 'privacy')
                    CookieConsentBanner(
                      onOpenPrivacyNotice: () =>
                          setState(() => _activeView = 'privacy'),
                    ),
                ],
              ),
            ),
            bottomNavigationBar: isSellerView
                ? null
                : KijaniFloatingCenterDock(
                    selectedIndex: _bottomNavIndex,
                    cartCount: AuthSessionManager.instance.cartCount,
                    onSelect: (idx) => _onDockSelected(idx, session),
                    items: [
                      const KijaniDockItem(
                        icon: Icons.home_outlined,
                        activeIcon: Icons.home_rounded,
                        label: 'Home',
                      ),
                      const KijaniDockItem(
                        icon: Icons.grid_view_outlined,
                        activeIcon: Icons.grid_view_rounded,
                        label: 'Aisles',
                      ),
                      const KijaniDockItem(
                        icon: Icons.local_shipping_outlined,
                        activeIcon: Icons.local_shipping_rounded,
                        label: 'Orders',
                      ),
                      KijaniDockItem(
                        icon: Icons.person_outline_rounded,
                        activeIcon: Icons.person_rounded,
                        label: session != null ? session.firstName : 'Sign In',
                      ),
                    ],
                  ),
          ),
        );
      },
    );
  }

  Widget _buildActiveView(AuthSessionData? session) {
    switch (_activeView) {
      case 'products':
        return ProductsScreen(
          initialCategory: _selectedCategory,
          initialSearch: _searchQuery,
          initialFlashOnly: _flashOnly,
          onOpenProductDetails: (prod) {
            setState(() {
              _activeProductPreview = prod;
              _activeProductId = (prod['product_id'] ?? '').toString();
              _activeView = 'product_details';
            });
          },
          onToggleWishlist: _toggleWishlist,
          onUpdateCartQty: _updateCartQty,
        );

      case 'product_details':
        return ProductDetailsScreen(
          productId: _activeProductId,
          initialPreview: _activeProductPreview,
          onBack: () => setState(() => _activeView = 'products'),
          onSelectRelatedProduct: (prod) {
            setState(() {
              _activeProductPreview = prod;
              _activeProductId = (prod['product_id'] ?? '').toString();
            });
          },
          onToggleWishlist: _toggleWishlist,
          onUpdateCartQty: _updateCartQty,
        );

      case 'cart':
        if (session == null) {
          return AuthScreen(
            initialMessage: 'Please sign in to access your shopping cart.',
            onAuthenticated: () => setState(() => _activeView = 'cart'),
          );
        }
        return CartScreen(
          onExploreProducts: () => setState(() => _activeView = 'products'),
          onProceedToCheckout: () => setState(() => _activeView = 'checkout'),
          onUpdateCartQty: _updateCartQty,
        );

      case 'checkout':
        return CheckoutScreen(
          onBackToCart: () => setState(() => _activeView = 'cart'),
          onOrderConfirmed: (orderId) {
            setState(() {
              if (orderId.isNotEmpty) {
                _activeOrderId = orderId;
                _activeView = 'order_details';
              } else {
                _activeView = 'orders';
              }
            });
          },
        );

      case 'orders':
        if (session == null) {
          return AuthScreen(
            initialMessage: 'Please sign in to track your orders & shipments.',
            onAuthenticated: () => setState(() => _activeView = 'orders'),
          );
        }
        return OrdersShipmentsHubScreen(
          onOpenOrderDetails: (oid) {
            setState(() {
              _activeOrderId = oid;
              _activeView = 'order_details';
            });
          },
        );

      case 'order_details':
        return OrderReceiptDetailScreen(
          orderId: _activeOrderId,
          onBack: () => setState(() => _activeView = 'orders'),
          onRateDeliveredProduct: (productId, orderId) {
            setState(() {
              _activeProductId = productId;
              _activeProductPreview = null;
              _activeView = 'product_details';
            });
          },
        );

      case 'wishlist':
        if (session == null) {
          return AuthScreen(
            initialMessage: 'Please sign in to view your saved wishlist.',
            onAuthenticated: () => setState(() => _activeView = 'wishlist'),
          );
        }
        return WishlistScreen(
          onOpenProductDetails: (prod) {
            setState(() {
              _activeProductPreview = prod;
              _activeProductId = (prod['product_id'] ?? '').toString();
              _activeView = 'product_details';
            });
          },
          onToggleWishlist: _toggleWishlist,
          onUpdateCartQty: _updateCartQty,
          onExploreProducts: () => setState(() => _activeView = 'products'),
        );

      case 'profile':
        if (session == null) {
          return AuthScreen(
            onAuthenticated: () => setState(() => _activeView = 'profile'),
          );
        }
        return ProfileScreen(
          onOpenAdminConsole: () => setState(() => _activeView = 'admin'),
          onOpenOrders: () => setState(() => _activeView = 'orders'),
          onOpenOrderReceipt: (oid) {
            setState(() {
              _activeOrderId = oid;
              _activeView = 'order_details';
            });
          },
          onSignedOut: () => setState(() => _activeView = 'home'),
        );

      case 'notifications':
        return NotificationsScreen(
          onOpenOrder: (oid) {
            setState(() {
              _activeOrderId = oid;
              _activeView = 'order_details';
            });
          },
          onOpenAdminConsole: () => setState(() => _activeView = 'admin'),
        );

      case 'privacy':
        return PrivacyNoticeScreen(
          onBackToShop: () => setState(() => _activeView = 'home'),
        );

      case 'login':
        return AuthScreen(
          onAuthenticated: () {
            _hydrateBackgroundProfileCartAndNotifs();
            setState(() => _activeView = 'home');
          },
        );

      case 'admin':
        if (session?.isAdmin != true) {
          return const Center(
            child: Text('401 — Administrator access required.'),
          );
        }
        return AdminConsoleScreen(
          onOpenOrderReceipt: (oid) {
            setState(() {
              _activeOrderId = oid;
              _activeView = 'order_details';
            });
          },
        );

      case 'seller':
        return SellerPortalScreen(
          onReturnToStorefront: () => setState(() => _activeView = 'home'),
        );

      case 'home':
      default:
        return HomeScreen(
          onNavigateProducts: ({String? category, bool flashOnly = false}) {
            setState(() {
              _selectedCategory = category;
              _searchQuery = null;
              _flashOnly = flashOnly;
              _activeView = 'products';
            });
          },
          onOpenProductDetails: (prod) {
            setState(() {
              _activeProductPreview = prod;
              _activeProductId = (prod['product_id'] ?? '').toString();
              _activeView = 'product_details';
            });
          },
          onNavigateOrders: () {
            setState(() {
              _activeView = session != null ? 'orders' : 'login';
            });
          },
          onOpenSellerPortal: () => setState(() => _activeView = 'seller'),
          onToggleWishlist: _toggleWishlist,
          onUpdateCartQty: _updateCartQty,
        );
    }
  }
}
