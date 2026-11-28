import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Represents a normalized JWT authentication session (Customer/Admin `profile`
/// or isolated Seller Center `seller_profile`).
class AuthSessionData {
  final Map<String, dynamic> user;
  final String accessToken;
  final String? refreshToken;
  final int? accessTokenExpiresAt;
  final int? refreshTokenExpiresAt;

  const AuthSessionData({
    required this.user,
    required this.accessToken,
    this.refreshToken,
    this.accessTokenExpiresAt,
    this.refreshTokenExpiresAt,
  });

  String get userId => (user['_id'] ?? user['email'] ?? '').toString();
  String get email => (user['email'] ?? '').toString();
  String get firstName => (user['first_name'] ?? '').toString();
  String get lastName => (user['last_name'] ?? '').toString();
  String get fullName {
    final full = '$firstName $lastName'.trim();
    return full.isNotEmpty ? full : (email.isNotEmpty ? email : 'Customer');
  }

  String get role => (user['role'] ?? 'USER').toString().toUpperCase();
  bool get isAdmin => role == 'ADMIN';
  bool get isSeller =>
      role == 'SELLER' ||
      (user['seller_profile'] is Map &&
          user['seller_profile']['status'] == 'APPROVED');

  List<String> get wishlist =>
      (user['wishlist'] as List?)?.map((e) => e.toString()).toList() ?? [];

  Map<String, dynamic> toJson() => {
        'user': user,
        'token': accessToken,
        'accessToken': accessToken,
        'refreshToken': refreshToken,
        'accessTokenExpiresAt': accessTokenExpiresAt,
        'refreshTokenExpiresAt': refreshTokenExpiresAt,
      };
}

/// Manages dual isolated auth sessions:
/// - `profile`: Customer Storefront & Admin Console session
/// - `seller_profile`: Standalone KijaniMart Seller Center session
/// Also manages cookie consent, user-scoped carts (`cart_<uid>`), and 24h SWR query cache.
class AuthSessionManager extends ChangeNotifier {
  static final AuthSessionManager instance = AuthSessionManager._internal();
  AuthSessionManager._internal();

  static const String customerKey = 'profile';
  static const String sellerKey = 'seller_profile';
  static const String cookieConsentKey = 'freshmart_cookie_consent_v1';
  static const String sessionIdKey = 'freshmart_session_id';
  static const String swrCacheKey = 'freshmart_rq_cache_v1';

  SharedPreferences? _prefs;
  AuthSessionData? _customerSession;
  AuthSessionData? _sellerSession;
  Map<String, dynamic>? _cookieConsent;
  String _trackerSessionId = '';
  List<Map<String, dynamic>> _cart = [];
  final Map<String, Map<String, dynamic>> _swrCache = {};

  Timer? _customerRefreshTimer;
  Timer? _sellerRefreshTimer;
  Future<AuthSessionData?> Function(bool useSeller)? onProactiveRefresh;

  AuthSessionData? get customerSession => _customerSession;
  AuthSessionData? get sellerSession => _sellerSession;
  Map<String, dynamic>? get cookieConsent => _cookieConsent;
  String get trackerSessionId => _trackerSessionId;
  List<Map<String, dynamic>> get cart => List.unmodifiable(_cart);

  int get cartCount => _cart.fold<int>(
        0,
        (sum, item) => sum + ((item['quantity'] as num?)?.toInt() ?? 1),
      );

  Future<void> init() async {
    _prefs = await SharedPreferences.getInstance();

    // 1. Tracker Session ID
    _trackerSessionId = _prefs?.getString(sessionIdKey) ?? '';
    if (_trackerSessionId.isEmpty) {
      _trackerSessionId =
          'sess_${DateTime.now().millisecondsSinceEpoch}_${DateTime.now().microsecond}';
      await _prefs?.setString(sessionIdKey, _trackerSessionId);
    }

    // 2. Cookie Consent
    final rawCookie = _prefs?.getString(cookieConsentKey);
    if (rawCookie != null && rawCookie.isNotEmpty) {
      try {
        _cookieConsent = Map<String, dynamic>.from(jsonDecode(rawCookie));
      } catch (_) {}
    }

    // 3. Hydrate 24-hour SWR Query Cache if performance cookies allowed
    if (isPerformanceCacheAllowed) {
      final rawCache = _prefs?.getString(swrCacheKey);
      if (rawCache != null && rawCache.isNotEmpty) {
        try {
          final decoded = jsonDecode(rawCache) as Map<String, dynamic>;
          final now = DateTime.now().millisecondsSinceEpoch;
          decoded.forEach((key, val) {
            if (val is Map<String, dynamic>) {
              final updatedAt = (val['updatedAt'] as num?)?.toInt() ?? 0;
              if (now - updatedAt <= 24 * 60 * 60 * 1000) {
                _swrCache[key] = val;
              }
            }
          });
        } catch (_) {}
      }
    }

    // 4. Hydrate Customer & Seller isolated sessions
    _customerSession = _readSessionFromPrefs(customerKey);
    _sellerSession = _readSessionFromPrefs(sellerKey);

    // 5. Hydrate User-Scoped Cart
    _loadUserScopedCart();

    _scheduleProactiveTimer(useSeller: false);
    _scheduleProactiveTimer(useSeller: true);
    notifyListeners();
  }

  // ==================== JWT EXPIRY DECODING & CHECKS ====================

  static int? decodeJwtExpMs(String? token) {
    if (token == null || token.isEmpty) return null;
    try {
      final parts = token.split('.');
      if (parts.length != 3) return null;
      final normalized = base64Url.normalize(parts[1]);
      final payloadJson = utf8.decode(base64Url.decode(normalized));
      final payload = jsonDecode(payloadJson);
      if (payload is Map && payload['exp'] is num) {
        return (payload['exp'] as num).toInt() * 1000;
      }
    } catch (_) {}
    return null;
  }

  static AuthSessionData? normalizeSession(
    Map<String, dynamic>? raw, [
    AuthSessionData? existing,
  ]) {
    if (raw == null && existing == null) return null;
    final src = raw ?? {};
    Map<String, dynamic>? userMap;
    if (src['user'] is Map) {
      userMap = Map<String, dynamic>.from(src['user']);
    } else if (src['data'] is Map && src['data']['user'] is Map) {
      userMap = Map<String, dynamic>.from(src['data']['user']);
    } else if (existing != null) {
      userMap = Map<String, dynamic>.from(existing.user);
    }

    final accessToken = (src['accessToken'] ??
            src['token'] ??
            existing?.accessToken ??
            '')
        .toString();
    if (accessToken.isEmpty || userMap == null) return null;

    final refreshToken = src.containsKey('refreshToken')
        ? src['refreshToken']?.toString()
        : existing?.refreshToken;

    final accessExp = (src['accessTokenExpiresAt'] as num?)?.toInt() ??
        decodeJwtExpMs(accessToken) ??
        existing?.accessTokenExpiresAt;
    final refreshExp = (src['refreshTokenExpiresAt'] as num?)?.toInt() ??
        decodeJwtExpMs(refreshToken) ??
        existing?.refreshTokenExpiresAt;

    return AuthSessionData(
      user: userMap,
      accessToken: accessToken,
      refreshToken: (refreshToken != null && refreshToken.isNotEmpty)
          ? refreshToken
          : null,
      accessTokenExpiresAt: accessExp,
      refreshTokenExpiresAt: refreshExp,
    );
  }

  static bool isAccessTokenExpired(AuthSessionData? session, [int skewMs = 15000]) {
    if (session == null || session.accessToken.isEmpty) return true;
    final expMs =
        session.accessTokenExpiresAt ?? decodeJwtExpMs(session.accessToken);
    if (expMs == null) return false;
    return DateTime.now().millisecondsSinceEpoch + skewMs >= expMs;
  }

  static bool isRefreshTokenExpired(AuthSessionData? session, [int skewMs = 5000]) {
    if (session == null ||
        session.refreshToken == null ||
        session.refreshToken!.isEmpty) {
      return true;
    }
    final expMs =
        session.refreshTokenExpiresAt ?? decodeJwtExpMs(session.refreshToken);
    if (expMs == null) return false;
    return DateTime.now().millisecondsSinceEpoch + skewMs >= expMs;
  }

  static bool isSessionCompletelyExpired(AuthSessionData? session) {
    if (session == null || session.accessToken.isEmpty) return true;
    if (isAccessTokenExpired(session, 0)) {
      if (session.refreshToken == null || isRefreshTokenExpired(session, 0)) {
        return true;
      }
    }
    return false;
  }

  AuthSessionData? _readSessionFromPrefs(String key) {
    try {
      final raw = _prefs?.getString(key);
      if (raw == null || raw.isEmpty) return null;
      final parsed = Map<String, dynamic>.from(jsonDecode(raw));
      final normalized = normalizeSession(parsed);
      if (normalized == null || isSessionCompletelyExpired(normalized)) {
        _prefs?.remove(key);
        return null;
      }
      return normalized;
    } catch (_) {
      _prefs?.remove(key);
      return null;
    }
  }

  Future<AuthSessionData?> saveSession(
    Map<String, dynamic> data, {
    bool useSeller = false,
  }) async {
    final current = useSeller ? _sellerSession : _customerSession;
    final normalized = normalizeSession(data, current);
    if (normalized == null) return null;

    final key = useSeller ? sellerKey : customerKey;
    await _prefs?.setString(key, jsonEncode(normalized.toJson()));

    if (useSeller) {
      _sellerSession = normalized;
    } else {
      final prevUserId = _customerSession?.userId;
      _customerSession = normalized;
      if (prevUserId != normalized.userId) {
        _loadUserScopedCart();
      }
    }

    _scheduleProactiveTimer(useSeller: useSeller);
    notifyListeners();
    return normalized;
  }

  Future<void> updateUserFields(
    Map<String, dynamic> updatedUser, {
    bool useSeller = false,
  }) async {
    final current = useSeller ? _sellerSession : _customerSession;
    if (current == null) return;
    final mergedUser = {...current.user, ...updatedUser};
    await saveSession({'user': mergedUser}, useSeller: useSeller);
  }

  Future<void> updateWishlistIds(List<String> validIds) async {
    if (_customerSession == null) return;
    final mergedUser = {..._customerSession!.user, 'wishlist': validIds};
    await saveSession({'user': mergedUser}, useSeller: false);
  }

  Future<void> clearSession({bool useSeller = false}) async {
    final key = useSeller ? sellerKey : customerKey;
    await _prefs?.remove(key);
    if (useSeller) {
      _sellerRefreshTimer?.cancel();
      _sellerSession = null;
    } else {
      _customerRefreshTimer?.cancel();
      _customerSession = null;
      _cart = [];
    }
    notifyListeners();
  }

  void _scheduleProactiveTimer({required bool useSeller}) {
    if (useSeller) {
      _sellerRefreshTimer?.cancel();
    } else {
      _customerRefreshTimer?.cancel();
    }

    final session = useSeller ? _sellerSession : _customerSession;
    if (session == null) return;

    final now = DateTime.now().millisecondsSinceEpoch;
    if (session.refreshTokenExpiresAt != null &&
        now >= session.refreshTokenExpiresAt!) {
      clearSession(useSeller: useSeller);
      return;
    }

    final accessExp = session.accessTokenExpiresAt;
    if (accessExp == null) return;

    const leadMs = 45 * 1000;
    final msUntilRefresh = accessExp - now - leadMs;
    final msUntilExpiry = accessExp - now;

    if (session.refreshToken != null && !isRefreshTokenExpired(session, 2000)) {
      final delayMs = msUntilRefresh.clamp(1000, 24 * 60 * 60 * 1000);
      final timer = Timer(Duration(milliseconds: delayMs), () {
        onProactiveRefresh?.call(useSeller);
      });
      if (useSeller) {
        _sellerRefreshTimer = timer;
      } else {
        _customerRefreshTimer = timer;
      }
    } else if (msUntilExpiry <= 0) {
      clearSession(useSeller: useSeller);
    } else {
      final timer = Timer(Duration(milliseconds: msUntilExpiry), () {
        clearSession(useSeller: useSeller);
      });
      if (useSeller) {
        _sellerRefreshTimer = timer;
      } else {
        _customerRefreshTimer = timer;
      }
    }
  }

  // ==================== USER-SCOPED CART (`cart_<uid>`) ====================

  String? get _cartStorageKey {
    final uid = _customerSession?.userId;
    return (uid != null && uid.isNotEmpty) ? 'cart_$uid' : null;
  }

  void _loadUserScopedCart() {
    final key = _cartStorageKey;
    if (key == null) {
      _cart = [];
      return;
    }
    try {
      final raw = _prefs?.getString(key);
      if (raw != null && raw.isNotEmpty) {
        final decoded = jsonDecode(raw) as List;
        _cart = decoded.map((e) => Map<String, dynamic>.from(e)).toList();
        return;
      }
      final serverCart = _customerSession?.user['cart'];
      if (serverCart is List) {
        _cart = serverCart.map((e) => Map<String, dynamic>.from(e)).toList();
        return;
      }
    } catch (_) {}
    _cart = [];
  }

  Future<void> setCart(
    List<Map<String, dynamic>> nextCart, {
    void Function(List<Map<String, dynamic>>)? onSyncServer,
  }) async {
    _cart = nextCart;
    final key = _cartStorageKey;
    if (key != null) {
      await _prefs?.setString(key, jsonEncode(_cart));
      onSyncServer?.call(_cart);
    }
    notifyListeners();
  }

  int getProductQuantityInCart(String productId) {
    final match = _cart.where((item) => item['product_id'] == productId);
    if (match.isEmpty) return 0;
    return (match.first['quantity'] as num?)?.toInt() ?? 0;
  }

  // ==================== COOKIE CONSENT & PRIVACY PREFERENCES ====================

  bool get hasCookieChoice =>
      _cookieConsent != null && _cookieConsent!['status'] != null;

  bool get isPersonalizationAllowed {
    if (_cookieConsent == null) return true;
    return _cookieConsent!['personalization'] != false;
  }

  bool get isPerformanceCacheAllowed {
    if (_cookieConsent == null) return true;
    return _cookieConsent!['performance'] != false;
  }

  Future<void> saveCookieConsent({
    String status = 'accepted',
    bool personalization = true,
    bool performance = true,
  }) async {
    _cookieConsent = {
      'status': status,
      'essential': true,
      'personalization': personalization,
      'performance': performance,
      'updatedAt': DateTime.now().toIso8601String(),
    };
    await _prefs?.setString(cookieConsentKey, jsonEncode(_cookieConsent));
    if (!performance) {
      _swrCache.clear();
      await _prefs?.remove(swrCacheKey);
    }
    notifyListeners();
  }

  Future<void> resetCookieConsent() async {
    _cookieConsent = null;
    await _prefs?.remove(cookieConsentKey);
    notifyListeners();
  }

  // ==================== PERSISTENT SWR QUERY CACHE (2m staleTime, 24h persist) ====================

  T? getCachedQuery<T>(String key) {
    final entry = _swrCache[key];
    if (entry == null) return null;
    return entry['data'] as T?;
  }

  bool isQueryFresh(String key, {int staleTimeMs = 2 * 60 * 1000}) {
    final entry = _swrCache[key];
    if (entry == null) return false;
    final updatedAt = (entry['updatedAt'] as num?)?.toInt() ?? 0;
    return DateTime.now().millisecondsSinceEpoch - updatedAt < staleTimeMs;
  }

  Future<void> setCachedQuery(String key, dynamic data) async {
    _swrCache[key] = {
      'data': data,
      'updatedAt': DateTime.now().millisecondsSinceEpoch,
    };
    if (isPerformanceCacheAllowed) {
      try {
        await _prefs?.setString(swrCacheKey, jsonEncode(_swrCache));
      } catch (_) {}
    }
    notifyListeners();
  }

  void invalidateQueries([String? prefix]) {
    if (prefix == null) {
      _swrCache.clear();
    } else {
      _swrCache.removeWhere((k, _) => k.startsWith(prefix));
    }
    notifyListeners();
  }

  /// 0ms Product Details Preview lookup across all cached catalog shelves
  Map<String, dynamic>? findCachedProductPreview(String productId) {
    for (final entry in _swrCache.values) {
      final data = entry['data'];
      if (data is List) {
        for (final item in data) {
          if (item is Map && item['product_id'] == productId) {
            return Map<String, dynamic>.from(item);
          }
          if (item is Map && item['products'] is List) {
            for (final p in item['products']) {
              if (p is Map && p['product_id'] == productId) {
                return Map<String, dynamic>.from(p);
              }
            }
          }
        }
      } else if (data is Map && data['products'] is List) {
        for (final p in data['products']) {
          if (p is Map && p['product_id'] == productId) {
            return Map<String, dynamic>.from(p);
          }
        }
      }
    }
    return null;
  }
}
