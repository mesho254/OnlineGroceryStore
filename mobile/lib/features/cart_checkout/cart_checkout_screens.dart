import 'dart:async';
import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/config/api_endpoints.dart';
import '../../core/network/api_client.dart';
import '../../core/network/auth_session_manager.dart';
import '../../core/utils/app_utils.dart';
import '../../shared/widgets/shared_widgets.dart';

/// 1. User-Scoped Shopping Cart Screen (Matches client/src/pages/cart/Cart.js & Screenshots 7 & 8)
class CartScreen extends StatelessWidget {
  final VoidCallback onExploreProducts;
  final VoidCallback onProceedToCheckout;
  final void Function(Map<String, dynamic> product, int nextQty) onUpdateCartQty;

  const CartScreen({
    super.key,
    required this.onExploreProducts,
    required this.onProceedToCheckout,
    required this.onUpdateCartQty,
  });

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: AuthSessionManager.instance,
      builder: (context, _) {
        final cart = AuthSessionManager.instance.cart;
        if (cart.isEmpty) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Container(
                padding: const EdgeInsets.all(28),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(22),
                  border: Border.all(color: KijaniColors.slate200),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 58,
                      height: 58,
                      decoration: BoxDecoration(
                        color: KijaniColors.emeraldLight,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: const Icon(
                        Icons.shopping_bag_outlined,
                        size: 30,
                        color: KijaniColors.emerald,
                      ),
                    ),
                    const SizedBox(height: 14),
                    const Text(
                      'Your shopping cart is empty',
                      style: TextStyle(
                        fontSize: 19,
                        fontWeight: FontWeight.w900,
                        color: KijaniColors.slate900,
                      ),
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      "Looks like you haven't added any farm-fresh groceries yet. Explore our aisles and fill your basket!",
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 13,
                        color: KijaniColors.slate500,
                        height: 1.4,
                      ),
                    ),
                    const SizedBox(height: 16),
                    ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: KijaniColors.emerald,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 20,
                          vertical: 12,
                        ),
                      ),
                      onPressed: onExploreProducts,
                      icon: const Text(
                        'Start Shopping',
                        style: TextStyle(fontWeight: FontWeight.w800),
                      ),
                      label: const Icon(Icons.storefront_outlined, size: 17),
                    ),
                  ],
                ),
              ),
            ),
          );
        }

        double originalTotal = 0;
        double payableTotal = 0;
        int totalUnits = 0;
        for (final item in cart) {
          final qty = (item['quantity'] as num?)?.toInt() ?? 1;
          totalUnits += qty;
          originalTotal += PricingUtils.getOriginalPrice(item) * qty;
          payableTotal += PricingUtils.getEffectivePrice(item) * qty;
        }
        final savings = (originalTotal - payableTotal).clamp(0, double.infinity);

        return ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 40),
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'YOUR GROCERY BASKET',
                        style: TextStyle(
                          fontSize: 10.5,
                          fontWeight: FontWeight.w800,
                          color: KijaniColors.emerald,
                        ),
                      ),
                      Text(
                        'Shopping Cart',
                        style: TextStyle(
                          fontSize: 23,
                          fontWeight: FontWeight.w900,
                          color: KijaniColors.slate900,
                        ),
                      ),
                    ],
                  ),
                ),
                TextButton(
                  onPressed: onExploreProducts,
                  child: const Text('← Continue Shopping'),
                ),
              ],
            ),
            const SizedBox(height: 14),

            // Cart Items List
            ...cart.map((item) {
              final qty = (item['quantity'] as num?)?.toInt() ?? 1;
              final stock = (item['stock'] as num?)?.toInt() ?? 99;
              final unitPrice = PricingUtils.getEffectivePrice(item);
              final lineTotal = unitPrice * qty;
              final weight =
                  '${item['weight'] ?? ''} ${item['measurement'] ?? ''}'.trim();
              final image = (item['image'] ?? '').toString();

              return Container(
                margin: const EdgeInsets.only(bottom: 12),
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: KijaniColors.emeraldBorder),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 64,
                      height: 64,
                      padding: const EdgeInsets.all(6),
                      decoration: BoxDecoration(
                        color: KijaniColors.slate50,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: image.isNotEmpty
                          ? Image.network(image, fit: BoxFit.contain)
                          : const Icon(
                              Icons.shopping_basket_outlined,
                              color: KijaniColors.emerald,
                            ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            (item['category'] ?? '').toString().toUpperCase(),
                            style: const TextStyle(
                              fontSize: 9.5,
                              fontWeight: FontWeight.w800,
                              color: KijaniColors.emerald,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            (item['name'] ?? '').toString(),
                            style: const TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w800,
                              color: KijaniColors.slate900,
                            ),
                          ),
                          if (weight.isNotEmpty) ...[
                            const SizedBox(height: 3),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 7,
                                vertical: 2,
                              ),
                              decoration: BoxDecoration(
                                color: KijaniColors.slate50,
                                borderRadius: BorderRadius.circular(999),
                              ),
                              child: Text(
                                weight,
                                style: const TextStyle(
                                  fontSize: 10.5,
                                  fontWeight: FontWeight.w700,
                                  color: KijaniColors.slate700,
                                ),
                              ),
                            ),
                          ],
                          const SizedBox(height: 8),
                          Container(
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(999),
                              border: Border.all(color: KijaniColors.slate200),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                InkWell(
                                  onTap: () => onUpdateCartQty(item, qty - 1),
                                  child: const Padding(
                                    padding: EdgeInsets.symmetric(
                                      horizontal: 10,
                                      vertical: 4,
                                    ),
                                    child: Icon(Icons.remove, size: 15),
                                  ),
                                ),
                                Text(
                                  '$qty',
                                  style: const TextStyle(
                                    fontSize: 12.5,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                                InkWell(
                                  onTap: qty < stock
                                      ? () => onUpdateCartQty(item, qty + 1)
                                      : null,
                                  child: const Padding(
                                    padding: EdgeInsets.symmetric(
                                      horizontal: 10,
                                      vertical: 4,
                                    ),
                                    child: Icon(Icons.add, size: 15),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          '${PricingUtils.formatKES(lineTotal)} KES',
                          style: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w900,
                            color: KijaniColors.slate900,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '${PricingUtils.formatKES(unitPrice)} KES / $weight',
                          style: const TextStyle(
                            fontSize: 10.5,
                            color: KijaniColors.slate500,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              );
            }),

            // Order Summary Card (Screenshot 8)
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: KijaniColors.slate200),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    'Order Summary',
                    style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w900,
                      color: KijaniColors.slate900,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Text(
                          'Original Price ($totalUnits Items)',
                          style: const TextStyle(
                            fontSize: 13,
                            color: KijaniColors.slate700,
                          ),
                        ),
                      ),
                      Text(
                        '${PricingUtils.formatKES(originalTotal)} KES',
                        style: const TextStyle(
                          fontSize: 13.5,
                          fontWeight: FontWeight.w800,
                          color: KijaniColors.slate900,
                        ),
                      ),
                    ],
                  ),
                  if (savings > 0) ...[
                    const SizedBox(height: 8),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Expanded(
                          child: Text(
                            'Flash & Bundle Savings',
                            style: TextStyle(
                              fontSize: 13,
                              color: KijaniColors.emerald,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        Text(
                          '-${PricingUtils.formatKES(savings)} KES',
                          style: const TextStyle(
                            fontSize: 13.5,
                            fontWeight: FontWeight.w800,
                            color: KijaniColors.emerald,
                          ),
                        ),
                      ],
                    ),
                  ],
                  const SizedBox(height: 8),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Expanded(
                        child: Text(
                          'Express 20-Min Delivery',
                          style: TextStyle(
                            fontSize: 13,
                            color: KijaniColors.slate700,
                          ),
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: KijaniColors.emeraldLight,
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: const Text(
                          'FREE',
                          style: TextStyle(
                            fontSize: 10.5,
                            fontWeight: FontWeight.w800,
                            color: KijaniColors.emeraldDark,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 12),
                    child: Divider(),
                  ),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Expanded(
                        child: Text(
                          'Payable Total',
                          style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w800,
                            color: KijaniColors.slate900,
                          ),
                        ),
                      ),
                      Text(
                        '${PricingUtils.formatKES(payableTotal)} KES',
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w900,
                          color: KijaniColors.emerald,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: KijaniColors.emerald,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(999),
                      ),
                    ),
                    onPressed: onProceedToCheckout,
                    icon: const Text(
                      'Proceed to Checkout',
                      style: TextStyle(
                        fontSize: 14.5,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    label: const Icon(Icons.arrow_forward_rounded, size: 18),
                  ),
                  const SizedBox(height: 12),
                  const Row(
                    children: [
                      Icon(
                        Icons.verified_user_outlined,
                        size: 15,
                        color: KijaniColors.emerald,
                      ),
                      SizedBox(width: 6),
                      Text(
                        'Secure Stripe Checkout • 20-Minute Express Dispatch',
                        style: TextStyle(
                          fontSize: 11.5,
                          color: KijaniColors.slate500,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}

/// 2. Stock-Locked Checkout Screen with Doorstep vs Pickup Hub Selection & Stripe Checkout
/// Matches client/src/pages/checkout/checkout.js & OrderSummary.js
class CheckoutScreen extends StatefulWidget {
  final VoidCallback onBackToCart;
  final ValueChanged<String> onOrderConfirmed;

  const CheckoutScreen({
    super.key,
    required this.onBackToCart,
    required this.onOrderConfirmed,
  });

  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends State<CheckoutScreen>
    with WidgetsBindingObserver {
  String _deliveryMethod = 'DOORSTEP'; // 'DOORSTEP' | 'PICKUP_STATION'
  String? _checkoutToken;
  String? _checkoutTokenId;
  String _validatedTotal = '0.00';
  List<Map<String, dynamic>> _pickupStations = [];
  Map<String, dynamic>? _selectedStation;

  final _firstNameCtrl = TextEditingController();
  final _lastNameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _cityCtrl = TextEditingController(text: 'Nairobi');
  final _areaCtrl = TextEditingController();
  final _streetCtrl = TextEditingController();
  final _buildingCtrl = TextEditingController();

  bool _validating = true;
  bool _submitting = false;
  bool _awaitingStripeVerification = false;
  bool _stripeRedirectedSuccess = false;
  bool _checkingSessionNow = false;
  String? _pendingStripeUrl;
  String? _pendingSessionId;
  String _pendingOrderId = '';
  Timer? _verificationPollTimer;
  HttpServer? _loopbackRedirectServer;
  String _error = '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _prefillUserAndValidateCart();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _verificationPollTimer?.cancel();
    _stopLoopbackRedirectServer();
    _firstNameCtrl.dispose();
    _lastNameCtrl.dispose();
    _emailCtrl.dispose();
    _phoneCtrl.dispose();
    _cityCtrl.dispose();
    _areaCtrl.dispose();
    _streetCtrl.dispose();
    _buildingCtrl.dispose();
    super.dispose();
  }

  Future<void> _stopLoopbackRedirectServer() async {
    final srv = _loopbackRedirectServer;
    _loopbackRedirectServer = null;
    if (srv != null) {
      try {
        await srv.close(force: true);
      } catch (_) {}
    }
  }

  /// Starts a local loopback HTTP server (`http://127.0.0.1:<port>`) on the device
  /// and passes it as the `Origin` header to `POST /payments`.
  /// When Stripe finishes payment (or cancel), Stripe redirects the In-App WebView to
  /// `http://127.0.0.1:<port>/checkout/success?order=...&session_id=...` instead of the web site,
  /// which immediately closes the In-App WebView and completes verification inside the app.
  Future<String?> _startLoopbackRedirectServer() async {
    if (kIsWeb) return null;
    await _stopLoopbackRedirectServer();
    try {
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      _loopbackRedirectServer = server;
      final origin = 'http://127.0.0.1:${server.port}';

      server.listen((HttpRequest req) async {
        final path = req.uri.path;
        final qOrder = req.uri.queryParameters['order'] ??
            req.uri.queryParameters['canceled_order'] ??
            _pendingOrderId;
        final qSession =
            req.uri.queryParameters['session_id'] ?? _pendingSessionId;
        final isCancel = path.contains('/cart') ||
            req.uri.queryParameters.containsKey('canceled_order') ||
            req.uri.queryParameters['status'] == 'cancel';

        req.response.statusCode = 200;
        req.response.headers.contentType = ContentType.html;
        req.response.write('''<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Returning to KijaniMart...</title>
<style>body{margin:0;background:#064E3B;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;padding:20px;}</style>
</head><body><div><h2>${isCancel ? 'Returning to KijaniMart Cart...' : '✓ Payment Received! Opening Order Receipt...'}</h2></div></body></html>''');
        await req.response.close();

        // Immediately close the In-App WebView so the user is back inside the Flutter app
        try {
          await closeInAppWebView();
        } catch (_) {}

        if (isCancel) {
          await _cancelInAppCheckout();
        } else {
          if (qOrder.isNotEmpty) _pendingOrderId = qOrder;
          if (qSession != null &&
              qSession.isNotEmpty &&
              !qSession.contains('CHECKOUT_SESSION_ID')) {
            _pendingSessionId = qSession;
          }
          if (mounted) {
            setState(() {
              _stripeRedirectedSuccess = true;
              _error = '';
            });
          }
          await _verifyPendingStripeSession(
            showUnpaidNotice: true,
            force: true,
          );
        }
        await _stopLoopbackRedirectServer();
      });

      return origin;
    } catch (_) {
      return null;
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed &&
        _awaitingStripeVerification &&
        _pendingSessionId != null) {
      _verifyPendingStripeSession(
        showUnpaidNotice: !_stripeRedirectedSuccess,
        force: true,
      );
    }
  }

  Future<void> _openStripeInAppBrowser(String checkoutUrl) async {
    final uri = Uri.tryParse(checkoutUrl);
    if (uri == null) return;
    // Use LaunchMode.inAppWebView so closeInAppWebView() programmatically closes
    // the WebView Activity on Android the moment payment completes!
    try {
      final launched = await launchUrl(
        uri,
        mode: LaunchMode.inAppWebView,
        webViewConfiguration: const WebViewConfiguration(
          enableJavaScript: true,
          enableDomStorage: true,
        ),
      );
      if (!launched) {
        await launchUrl(
          uri,
          mode: LaunchMode.inAppBrowserView,
          browserConfiguration: const BrowserConfiguration(showTitle: true),
        );
      }
    } catch (_) {
      await launchUrl(
        uri,
        mode: LaunchMode.inAppBrowserView,
        browserConfiguration: const BrowserConfiguration(showTitle: true),
      );
    }
  }

  void _startStripeSessionVerificationPolling() {
    _verificationPollTimer?.cancel();
    _verificationPollTimer = Timer.periodic(
      const Duration(milliseconds: 1500),
      (_) => _verifyPendingStripeSession(showUnpaidNotice: false),
    );
  }

  Future<void> _verifyPendingStripeSession({
    bool showUnpaidNotice = false,
    bool force = false,
  }) async {
    final sessionId = _pendingSessionId;
    if (sessionId == null || sessionId.isEmpty) return;

    if (_checkingSessionNow) {
      if (!force) return;
      // Wait for the in-flight background poll to finish so forced verification after
      // Stripe redirect is never dropped
      int waited = 0;
      while (_checkingSessionNow && waited < 25) {
        await Future.delayed(const Duration(milliseconds: 120));
        waited++;
      }
      if (!_awaitingStripeVerification) return;
    }

    if (mounted) {
      setState(() {
        _checkingSessionNow = true;
        if (_stripeRedirectedSuccess) _error = '';
      });
    } else {
      _checkingSessionNow = true;
    }

    try {
      final res = await ApiClient.instance.dio.get(
        ApiEndpoints.verifyCheckoutSession(sessionId),
      );
      if (res.data is Map && res.data['payment_status'] == 'paid') {
        _verificationPollTimer?.cancel();
        final confirmedOrderId =
            (res.data['order_id'] ?? _pendingOrderId).toString();
        try {
          await closeInAppWebView();
        } catch (_) {}
        await AuthSessionManager.instance.setCart(
          [],
          onSyncServer: (emptyCart) {
            ApiClient.instance.dio
                .put(ApiEndpoints.cart, data: {'cart': emptyCart})
                .catchError((_) => Response(requestOptions: RequestOptions()));
          },
        );
        if (mounted) {
          setState(() {
            _awaitingStripeVerification = false;
            _stripeRedirectedSuccess = false;
          });
          widget.onOrderConfirmed(confirmedOrderId);
        }
        return;
      }
    } on DioException catch (e) {
      final status = e.response?.statusCode;
      final data = e.response?.data;
      final msg = data is Map ? data['message']?.toString() : null;
      // 409 OUT_OF_STOCK_REFUNDED: another shopper purchased the last unit simultaneously
      if (status == 409) {
        _verificationPollTimer?.cancel();
        try {
          await closeInAppWebView();
        } catch (_) {}
        if (mounted) {
          setState(() {
            _awaitingStripeVerification = false;
            _stripeRedirectedSuccess = false;
            _error = msg ??
                'Item went out of stock during checkout. Your payment was automatically refunded.';
          });
        }
        return;
      }
      if (showUnpaidNotice && !_stripeRedirectedSuccess && mounted) {
        setState(() {
          _error = msg ??
              'Stripe reports that payment has not been completed yet. Orders are only processed after Stripe confirms payment.';
        });
      }
    } finally {
      _checkingSessionNow = false;
      if (mounted) {
        setState(() {});
      }
    }
  }

  Future<void> _cancelInAppCheckout() async {
    _verificationPollTimer?.cancel();
    final oid = _pendingOrderId;
    if (oid.isNotEmpty) {
      try {
        await ApiClient.instance.dio.delete(
          ApiEndpoints.cancelPendingCheckout(oid),
        );
      } catch (_) {}
    }
    if (mounted) {
      setState(() {
        _awaitingStripeVerification = false;
        _stripeRedirectedSuccess = false;
        _pendingStripeUrl = null;
        _pendingSessionId = null;
        _error = '';
      });
    }
  }

  Future<void> _prefillUserAndValidateCart() async {
    final user = AuthSessionManager.instance.customerSession?.user;
    if (user != null) {
      _firstNameCtrl.text = (user['first_name'] ?? '').toString();
      _lastNameCtrl.text = (user['last_name'] ?? '').toString();
      _emailCtrl.text = (user['email'] ?? '').toString();
      _phoneCtrl.text = (user['phone'] ?? '').toString();
      if (user['address'] is Map) {
        final addr = user['address'] as Map;
        _cityCtrl.text = (addr['city'] ?? 'Nairobi').toString();
        _areaCtrl.text = (addr['area'] ?? '').toString();
        _streetCtrl.text = (addr['street'] ?? '').toString();
        _buildingCtrl.text = (addr['building_number'] ?? '').toString();
      }
    }

    setState(() {
      _validating = true;
      _error = '';
    });

    try {
      final cart = AuthSessionManager.instance.cart;
      final results = await Future.wait([
        ApiClient.instance.dio.post(
          ApiEndpoints.validateCart,
          data: {'cart': cart},
        ),
        ApiClient.instance.dio.get(ApiEndpoints.pickupStations),
      ]);

      final cartRes = results[0];
      final stationsRes = results[1];

      if (cartRes.data is Map) {
        _checkoutToken = cartRes.data['token']?.toString();
        _checkoutTokenId = cartRes.data['checkout_token_id']?.toString();
        _validatedTotal = (cartRes.data['total'] ?? '0.00').toString();
      }
      if (stationsRes.data is List) {
        _pickupStations = (stationsRes.data as List)
            .map((e) => Map<String, dynamic>.from(e as Map))
            .where((s) => s['active'] != false)
            .toList();
        if (_pickupStations.isNotEmpty) {
          _selectedStation = _pickupStations.first;
        }
      }
    } on DioException catch (e) {
      setState(() {
        _error = (e.response?.data is Map
                ? e.response?.data['message']?.toString()
                : e.message) ??
            'Could not validate cart stock.';
      });
    } finally {
      if (mounted) setState(() => _validating = false);
    }
  }

  Future<void> _submitCheckout() async {
    if (_firstNameCtrl.text.trim().isEmpty ||
        _emailCtrl.text.trim().isEmpty ||
        _phoneCtrl.text.trim().isEmpty) {
      setState(
        () => _error = 'Please fill in your name, email, and phone number.',
      );
      return;
    }
    if (_deliveryMethod == 'DOORSTEP' &&
        (_areaCtrl.text.trim().isEmpty || _streetCtrl.text.trim().isEmpty)) {
      setState(
        () => _error = 'Please provide your Nairobi area/estate and street.',
      );
      return;
    }
    if (_deliveryMethod == 'PICKUP_STATION' && _selectedStation == null) {
      setState(() => _error = 'Please choose a KijaniMart Pickup Station.');
      return;
    }

    setState(() {
      _submitting = true;
      _error = '';
    });

    try {
      final cart = AuthSessionManager.instance.cart;
      final productIds =
          cart.map((c) => c['product_id']?.toString()).whereType<String>().toList();

      // Real-time stock check (excluding user's own checkout_token_id reservation)
      await ApiClient.instance.dio.post(
        ApiEndpoints.stockCheck,
        data: {
          'product_ids': productIds,
          'exclude_checkout_token_id': _checkoutTokenId,
        },
      );

      final addressPayload = _deliveryMethod == 'PICKUP_STATION'
          ? {
              'delivery_method': 'PICKUP_STATION',
              'city': _selectedStation!['city'] ?? 'Nairobi',
              'area': _selectedStation!['area'] ?? '',
              'street': _selectedStation!['address'] ??
                  _selectedStation!['landmark'] ??
                  '',
              'pickup_station': _selectedStation,
            }
          : {
              'delivery_method': 'DOORSTEP',
              'city': _cityCtrl.text.trim(),
              'area': _areaCtrl.text.trim(),
              'street': _streetCtrl.text.trim(),
              'building_number': _buildingCtrl.text.trim(),
            };

      final loopbackOrigin = await _startLoopbackRedirectServer();

      final payRes = await ApiClient.instance.dio.post(
        ApiEndpoints.payments,
        options: loopbackOrigin != null
            ? Options(headers: {'Origin': loopbackOrigin})
            : null,
        data: {
          'token': _checkoutToken,
          'platform': 'mobile',
          'data': {
            'name': {
              'first': _firstNameCtrl.text.trim(),
              'last': _lastNameCtrl.text.trim(),
            },
            'email': _emailCtrl.text.trim(),
            'phone_number': _phoneCtrl.text.trim(),
            'address': addressPayload,
          },
        },
      );

      if (payRes.data is Map) {
        final checkoutUrl = payRes.data['url']?.toString();
        var sessionId = payRes.data['sessionId']?.toString();
        if ((sessionId == null || sessionId.isEmpty) && checkoutUrl != null) {
          final match =
              RegExp(r'cs_(?:test|live)_[A-Za-z0-9]+').firstMatch(checkoutUrl);
          sessionId = match?.group(0);
        }
        final orderId = payRes.data['order_id']?.toString() ?? '';

        if (checkoutUrl != null && checkoutUrl.isNotEmpty) {
          setState(() {
            _pendingStripeUrl = checkoutUrl;
            _pendingSessionId = sessionId;
            _pendingOrderId = orderId;
            _stripeRedirectedSuccess = false;
            _awaitingStripeVerification = true;
          });
          _startStripeSessionVerificationPolling();
          await _openStripeInAppBrowser(checkoutUrl);
        }
      }
    } on DioException catch (e) {
      setState(() {
        _error = (e.response?.data is Map
                ? e.response?.data['message']?.toString()
                : e.message) ??
            'Checkout failed.';
      });
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_validating) {
      return const Center(
        child: CircularProgressIndicator(color: KijaniColors.emerald),
      );
    }

    if (_awaitingStripeVerification) {
      final isProcessingPaidOrder =
          _stripeRedirectedSuccess || _checkingSessionNow;

      return ListView(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 110),
        children: [
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: KijaniColors.slate200),
              boxShadow: [
                BoxShadow(
                  color: KijaniColors.slate900.withValues(alpha: 0.06),
                  blurRadius: 22,
                  offset: const Offset(0, 10),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: Container(
                    width: 68,
                    height: 68,
                    decoration: BoxDecoration(
                      color: isProcessingPaidOrder
                          ? KijaniColors.emeraldLight
                          : const Color(0xFFFEF3C7),
                      shape: BoxShape.circle,
                    ),
                    child: Center(
                      child: isProcessingPaidOrder
                          ? const SizedBox(
                              width: 30,
                              height: 30,
                              child: CircularProgressIndicator(
                                strokeWidth: 3.2,
                                color: KijaniColors.emerald,
                              ),
                            )
                          : const Icon(
                              Icons.lock_clock_rounded,
                              size: 32,
                              color: Color(0xFFD97706),
                            ),
                    ),
                  ),
                ),
                const SizedBox(height: 18),
                Text(
                  isProcessingPaidOrder
                      ? 'Order #$_pendingOrderId Is Being Processed — Please Wait...'
                      : 'Stripe Payment Pending for Order #$_pendingOrderId',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 19,
                    fontWeight: FontWeight.w900,
                    color: KijaniColors.slate900,
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  isProcessingPaidOrder
                      ? 'Your Stripe payment is being verified securely with the server and your official POS receipt is being generated. You will be redirected automatically in a moment...'
                      : 'We checked directly with Stripe and payment for Order #$_pendingOrderId has not been completed yet. Orders cannot be confirmed until Stripe verifies your payment.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 13,
                    color: KijaniColors.slate500,
                    height: 1.45,
                  ),
                ),
                const SizedBox(height: 18),
                if (_error.isNotEmpty && !isProcessingPaidOrder)
                  Container(
                    margin: const EdgeInsets.only(bottom: 14),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFEF2F2),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      _error,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: Color(0xFFB91C1C),
                        fontSize: 12.5,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                if (!isProcessingPaidOrder) ...[
                  ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: KijaniColors.emerald,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                    onPressed: () {
                      if (_pendingStripeUrl != null) {
                        _openStripeInAppBrowser(_pendingStripeUrl!);
                      }
                    },
                    icon: const Icon(Icons.lock_outline_rounded, size: 18),
                    label: const Text(
                      'Continue Payment on Stripe',
                      style: TextStyle(
                        fontWeight: FontWeight.w900,
                        fontSize: 14,
                      ),
                    ),
                  ),
                  const SizedBox(height: 10),
                  TextButton(
                    onPressed: _cancelInAppCheckout,
                    child: const Text(
                      'Cancel Checkout & Return to Delivery Form',
                      style: TextStyle(
                        color: KijaniColors.danger,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      );
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 40),
      children: [
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: widget.onBackToCart,
            icon: const Icon(Icons.arrow_back_rounded, size: 17),
            label: const Text('Back to Cart'),
          ),
        ),
        const Text(
          'Express Checkout & Fulfillment',
          style: TextStyle(
            fontSize: 22,
            fontWeight: FontWeight.w900,
            color: KijaniColors.slate900,
          ),
        ),
        const SizedBox(height: 12),

        if (_error.isNotEmpty)
          Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFFFEE2E2),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              _error,
              style: const TextStyle(
                color: Color(0xFFB91C1C),
                fontWeight: FontWeight.w700,
                fontSize: 12.5,
              ),
            ),
          ),

        // 1. Delivery Method Selector (Doorstep vs Free Pickup Hub)
        Row(
          children: [
            Expanded(
              child: _buildModeCard(
                mode: 'DOORSTEP',
                icon: Icons.delivery_dining_rounded,
                title: '20-Min Doorstep',
                sub: 'Free express rider',
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _buildModeCard(
                mode: 'PICKUP_STATION',
                icon: Icons.storefront_rounded,
                title: 'Free Pickup Hub',
                sub: '${_pickupStations.length} Nairobi stations',
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),

        // 2. Contact Information
        Container(
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
                '1. Contact Details',
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w900,
                  color: KijaniColors.slate900,
                ),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _firstNameCtrl,
                      decoration: const InputDecoration(
                        labelText: 'First Name *',
                        border: OutlineInputBorder(),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: TextField(
                      controller: _lastNameCtrl,
                      decoration: const InputDecoration(
                        labelText: 'Last Name',
                        border: OutlineInputBorder(),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _emailCtrl,
                decoration: const InputDecoration(
                  labelText: 'Email Address (for Receipt & Updates) *',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _phoneCtrl,
                decoration: const InputDecoration(
                  labelText: 'Phone Number *',
                  border: OutlineInputBorder(),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),

        // 3. Doorstep Address OR Pickup Hub Picker
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: KijaniColors.slate200),
          ),
          child: _deliveryMethod == 'DOORSTEP'
              ? Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      '2. Doorstep Delivery Address',
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w900,
                        color: KijaniColors.slate900,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _cityCtrl,
                            decoration: const InputDecoration(
                              labelText: 'City *',
                              border: OutlineInputBorder(),
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: TextField(
                            controller: _areaCtrl,
                            decoration: const InputDecoration(
                              labelText: 'Area / Estate *',
                              border: OutlineInputBorder(),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: _streetCtrl,
                      decoration: const InputDecoration(
                        labelText: 'Street / Road *',
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: _buildingCtrl,
                      decoration: const InputDecoration(
                        labelText: 'Building / House / Apt',
                        border: OutlineInputBorder(),
                      ),
                    ),
                  ],
                )
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      '2. Choose KijaniMart Pickup Station (FREE)',
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w900,
                        color: KijaniColors.slate900,
                      ),
                    ),
                    const SizedBox(height: 10),
                    ..._pickupStations.map((st) {
                      final isSelected =
                          _selectedStation?['station_id'] == st['station_id'] &&
                              _selectedStation?['name'] == st['name'];
                      return InkWell(
                        onTap: () => setState(() => _selectedStation = st),
                        child: Container(
                          margin: const EdgeInsets.only(bottom: 10),
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: isSelected
                                ? KijaniColors.emeraldLight
                                : KijaniColors.slate50,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: isSelected
                                  ? KijaniColors.emerald
                                  : KijaniColors.slate200,
                              width: isSelected ? 2 : 1,
                            ),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                mainAxisAlignment:
                                    MainAxisAlignment.spaceBetween,
                                children: [
                                  Expanded(
                                    child: Text(
                                      (st['name'] ?? '').toString(),
                                      style: const TextStyle(
                                        fontSize: 13.5,
                                        fontWeight: FontWeight.w800,
                                        color: KijaniColors.slate900,
                                      ),
                                    ),
                                  ),
                                  const Text(
                                    'FREE PICKUP',
                                    style: TextStyle(
                                      fontSize: 10,
                                      fontWeight: FontWeight.w800,
                                      color: KijaniColors.emerald,
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 3),
                              Text(
                                '${st['address'] ?? ''} • ${st['landmark'] ?? ''}',
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: KijaniColors.slate700,
                                ),
                              ),
                              if (st['opening_hours'] != null)
                                Text(
                                  'Hours: ${st['opening_hours']}',
                                  style: const TextStyle(
                                    fontSize: 11,
                                    color: KijaniColors.slate500,
                                  ),
                                ),
                            ],
                          ),
                        ),
                      );
                    }),
                  ],
                ),
        ),
        const SizedBox(height: 18),

        ElevatedButton.icon(
          style: ElevatedButton.styleFrom(
            backgroundColor: KijaniColors.emerald,
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(vertical: 15),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
            ),
          ),
          onPressed: _submitting ? null : _submitCheckout,
          icon: const Icon(Icons.lock_outline_rounded, size: 18),
          label: Text(
            _submitting
                ? 'Locking Stock & Opening Stripe...'
                : 'Pay KES $_validatedTotal via Stripe Checkout →',
            style: const TextStyle(
              fontSize: 14.5,
              fontWeight: FontWeight.w900,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildModeCard({
    required String mode,
    required IconData icon,
    required String title,
    required String sub,
  }) {
    final active = _deliveryMethod == mode;
    return InkWell(
      onTap: () => setState(() => _deliveryMethod = mode),
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: active ? KijaniColors.emeraldLight : Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: active ? KijaniColors.emerald : KijaniColors.slate200,
            width: active ? 2 : 1,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: KijaniColors.emerald, size: 22),
            const SizedBox(height: 6),
            Text(
              title,
              style: const TextStyle(
                fontSize: 13.5,
                fontWeight: FontWeight.w800,
                color: KijaniColors.slate900,
              ),
            ),
            Text(
              sub,
              style: const TextStyle(
                fontSize: 11,
                color: KijaniColors.slate500,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
