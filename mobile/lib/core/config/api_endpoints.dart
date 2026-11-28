// KijaniMart Flutter Mobile App — API Endpoints & Environment Configuration
// Matches client/src/api/BaseURLs.js and client/src/api/index.js

class ApiEndpoints {
  static const String cloudBackendUrl =
      'https://online-grocery-store-api.onrender.com';
  static const String androidEmulatorLocalUrl = 'http://10.0.2.2:5000';
  static const String desktopLocalUrl = 'http://localhost:5000';

  static String baseUrl = const String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://online-grocery-store-api.onrender.com',
  );

  static void setBaseUrl(String url) {
    baseUrl = url.trim().replaceAll(RegExp(r'/+$'), '');
  }

  /// Uses the deployed Render backend (`https://online-grocery-store-api.onrender.com`)
  /// by default unless `--dart-define=API_BASE_URL=...` is explicitly passed.
  static Future<void> autoSelectBestBackend() async {
    const definedUrl = String.fromEnvironment('API_BASE_URL');
    if (definedUrl.isNotEmpty) {
      setBaseUrl(definedUrl);
      return;
    }
    setBaseUrl(cloudBackendUrl);
  }

  static String get productsBase => '$baseUrl/products';
  static String get ordersBase => '$baseUrl/orders';
  static String get shippingBase => '$baseUrl/shipping';
  static String get paymentsBase => '$baseUrl/payments';
  static String get notificationsBase => '$baseUrl/notifications';
  static String get adminBase => '$baseUrl/admin';
  static String get sellerBase => '$baseUrl/seller';
  static String get userBase => '$baseUrl/api/v1';

  // Products & Recommendations
  static String productsPerPage(int page, {String? category, bool flash = false}) {
    final catPart = (category != null && category.isNotEmpty && category != 'All')
        ? '&category=${Uri.encodeQueryComponent(category)}'
        : '';
    final flashPart = flash ? '&flash=true' : '';
    return '$productsBase?page=$page$catPart$flashPart';
  }

  static String productsSearch(String search, int page) =>
      '$productsBase/search?search=${Uri.encodeQueryComponent(search)}&page=$page';

  static String get recommendations => '$productsBase/recommendations';
  static String get interactions => '$productsBase/interactions';
  static String get flashSales => '$productsBase/flash-sales';
  static String productById(String id) => '$productsBase/$id';
  static String get pendingReviews => '$productsBase/pending-reviews';
  static String reviewEligibility(String id, {String? orderId}) =>
      '$productsBase/$id/review-eligibility${orderId != null && orderId.isNotEmpty ? '?order=${Uri.encodeQueryComponent(orderId)}' : ''}';
  static String productReviews(String id) => '$productsBase/$id/reviews';
  static String get validateCart => '$productsBase/cart';
  static String get stockCheck => '$productsBase/stock-check';

  // Auth, Profile, Wishlist & Cart
  static String get login => '$userBase/login';
  static String get signup => '$userBase/signup';
  static String get refreshToken => '$userBase/refresh-token';
  static String get logout => '$userBase/logout';
  static String get forgotPassword => '$userBase/forgot-password';
  static String resetPassword(String token) => '$userBase/reset-password/$token';
  static String get verify => '$userBase/verify';
  static String get wishlist => '$userBase/wishlist';
  static String get cart => '$userBase/cart';
  static String get profile => '$userBase/profile';
  static String get changePassword => '$userBase/profile/password';
  static String get suspendAccount => '$userBase/profile/suspend';

  // Orders & POS PDF Receipt
  static String ordersPage(int page) => '$ordersBase?page=$page';
  static String get myOrders => '$ordersBase/my-orders';
  static String orderById(String id) => '$ordersBase/${Uri.encodeComponent(id)}';
  static String orderReceiptPdf(String id) =>
      '$ordersBase/${Uri.encodeComponent(id)}/receipt.pdf';

  // Shipping & Pickup Stations
  static String shipmentsPage(int page) => '$shippingBase?page=$page';
  static String get myShipments => '$shippingBase/my-shipments';
  static String shipmentById(String id) => '$shippingBase/${Uri.encodeComponent(id)}';
  static String get pickupStations => '$shippingBase/pickup-stations';
  static String pickupStationById(String id) => '$shippingBase/pickup-stations/$id';

  // Payments & Stripe Checkout
  static String get payments => paymentsBase;
  static String verifyCheckoutSession(String sessionId) =>
      '$paymentsBase/session/${Uri.encodeComponent(sessionId)}';
  static String cancelPendingCheckout(String orderId) =>
      '$paymentsBase/pending/${Uri.encodeComponent(orderId)}';

  // Notifications
  static String notifications({String scope = 'all', int limit = 50}) =>
      '$notificationsBase?scope=${Uri.encodeQueryComponent(scope)}&limit=$limit';
  static String markNotificationRead(String id) => '$notificationsBase/$id/read';
  static String markAllNotificationsRead({String scope = 'mine'}) =>
      '$notificationsBase/read-all?scope=${Uri.encodeQueryComponent(scope)}';

  // Admin Console
  static String get adminOverview => '$adminBase/overview';
  static String get adminRunStockScan => '$adminBase/stock-alerts/run';
  static String get adminSellers => '$adminBase/sellers';
  static String adminSellerStatus(String sellerId) => '$adminBase/sellers/$sellerId/status';
  static String get adminUsers => '$adminBase/users';
  static String adminUserRole(String userId) => '$adminBase/users/$userId/role';
  static String adminDeleteUser(String userId) => '$adminBase/users/$userId';
  static String get adminInventory => '$adminBase/products';
  static String adminProductQuick(String productId) => '$adminBase/products/$productId';
  static String adminProductFull(String productId) => '$adminBase/products/$productId/full';
  static String adminProductApproval(String productId) =>
      '$adminBase/products/$productId/approval';
  static String adminProductPendingChanges(String productId) =>
      '$adminBase/products/$productId/pending-changes';
  static String get adminTrash => '$adminBase/trash';
  static String adminRestoreProduct(String productId) =>
      '$adminBase/trash/products/$productId/restore';
  static String adminPermanentDeleteProduct(String productId) =>
      '$adminBase/trash/products/$productId/permanent';
  static String adminRestoreUser(String userId) => '$adminBase/trash/users/$userId/restore';
  static String adminPermanentDeleteUser(String userId) =>
      '$adminBase/trash/users/$userId/permanent';
  static String get adminTrashPurgeNow => '$adminBase/trash/purge-now';
  static String adminLogs({String category = 'ALL', String severity = 'ALL'}) =>
      '$adminBase/logs?category=${Uri.encodeQueryComponent(category)}&severity=${Uri.encodeQueryComponent(severity)}';

  // Seller Center
  static String get sellerRegister => '$sellerBase/register';
  static String get sellerApply => '$sellerBase/apply';
  static String get sellerStatus => '$sellerBase/status';
  static String get sellerOverview => '$sellerBase/overview';
  static String get sellerProducts => '$sellerBase/products';
  static String sellerProductById(String productId) => '$sellerBase/products/$productId';
  static String get sellerOrders => '$sellerBase/orders';
  static String sellerProposeOrderStatus(String orderId) =>
      '$sellerBase/orders/$orderId/status';
  static String get sellerReviews => '$sellerBase/reviews';
  static String get sellerProfile => '$sellerBase/profile';
  static String get sellerNotifications => '$sellerBase/notifications';
  static String get sellerMarkAllNotificationsRead =>
      '$sellerBase/notifications/read-all';
}
