import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import '../config/api_endpoints.dart';
import 'auth_session_manager.dart';

/// Production Dio HTTP client with:
/// 1. Dual isolated JWT sessions (`profile` for Customer/Admin vs `seller_profile` for Seller Center)
/// 2. Proactive access-token rotation (20s before expiry)
/// 3. Single-flight reactive 401 (`TOKEN_EXPIRED`) queue-and-retry via `POST /api/v1/refresh-token`
/// 4. Behavioral telemetry (`CLICK`, `VIEW`, `DWELL`, `CART_ADD`, `WISHLIST_ADD`, `SEARCH`) with Cookie Consent guard
/// 5. Live Console & Network Inspector buffer (`consoleLogs`)
class ApiClient extends ChangeNotifier {
  static final ApiClient instance = ApiClient._internal();

  late final Dio dio;
  final List<String> consoleLogs = [];

  void addConsoleLog(String message) {
    final now = DateTime.now();
    final ts =
        '${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}:${now.second.toString().padLeft(2, '0')}';
    final line = '[$ts] $message';
    debugPrint(line);
    consoleLogs.insert(0, line);
    if (consoleLogs.length > 120) {
      consoleLogs.removeLast();
    }
    notifyListeners();
  }

  void clearConsoleLogs() {
    consoleLogs.clear();
    notifyListeners();
  }
  final Dio _refreshDio = Dio(
    BaseOptions(
      connectTimeout: const Duration(seconds: 12),
      receiveTimeout: const Duration(seconds: 15),
    ),
  );

  Future<AuthSessionData?>? _inFlightCustomerRefresh;
  Future<AuthSessionData?>? _inFlightSellerRefresh;

  ApiClient._internal() {
    dio = Dio(
      BaseOptions(
        connectTimeout: const Duration(seconds: 35),
        receiveTimeout: const Duration(seconds: 35),
        headers: {'Content-Type': 'application/json'},
      ),
    );

    AuthSessionManager.instance.onProactiveRefresh =
        (bool useSeller) => refreshAuthSession(useSeller: useSeller);

    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final useSeller = options.extra['useSellerSession'] == true;
          final isBypass = _isAuthBypassUrl(options.path);

          var session = useSeller
              ? AuthSessionManager.instance.sellerSession
              : AuthSessionManager.instance.customerSession;

          // Proactively rotate access token if expiring within 20 seconds
          if (session != null &&
              !isBypass &&
              AuthSessionManager.isAccessTokenExpired(session, 20000) &&
              session.refreshToken != null &&
              !AuthSessionManager.isRefreshTokenExpired(session, 2000)) {
            try {
              session = await refreshAuthSession(useSeller: useSeller);
            } catch (_) {
              session = useSeller
                  ? AuthSessionManager.instance.sellerSession
                  : AuthSessionManager.instance.customerSession;
            }
          }

          if (session != null && session.accessToken.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer ${session.accessToken}';
          }

          final sid = AuthSessionManager.instance.trackerSessionId;
          if (sid.isNotEmpty) {
            options.headers['X-Session-Id'] = sid;
          }

          options.extra['_startTimeMs'] = DateTime.now().millisecondsSinceEpoch;
          addConsoleLog('→ ${options.method} ${options.uri}');

          return handler.next(options);
        },
        onResponse: (response, handler) async {
          final startMs =
              response.requestOptions.extra['_startTimeMs'] as int?;
          final elapsed = startMs != null
              ? '${DateTime.now().millisecondsSinceEpoch - startMs}ms'
              : '';
          addConsoleLog(
            '✓ ${response.statusCode} ${response.requestOptions.method} ${response.requestOptions.uri} ($elapsed)',
          );
          final data = response.data;
          if (data is Map<String, dynamic> &&
              data['accessToken'] != null &&
              data['refreshToken'] != null &&
              !_isAuthBypassUrl(response.requestOptions.path)) {
            final useSeller =
                response.requestOptions.extra['useSellerSession'] == true;
            await AuthSessionManager.instance.saveSession(
              data,
              useSeller: useSeller,
            );
          }
          return handler.next(response);
        },
        onError: (DioException error, handler) async {
          final req = error.requestOptions;
          final status = error.response?.statusCode;
          addConsoleLog(
            '✕ ${status ?? 'ERR'} ${req.method} ${req.uri} — ${error.message ?? 'Network error'}',
          );
          final respData = error.response?.data;
          final code =
              respData is Map ? respData['code']?.toString() : null;
          final useSeller = req.extra['useSellerSession'] == true;

          if (status != 401 ||
              req.extra['_retry'] == true ||
              _isAuthBypassUrl(req.path)) {
            return handler.next(error);
          }

          final isPasswordOrPaymentCheck =
              req.path.contains('/profile/password') ||
              req.path.contains('/profile/suspend') ||
              req.path.contains('/payments');

          if (isPasswordOrPaymentCheck && code != 'TOKEN_EXPIRED') {
            return handler.next(error);
          }

          final current = useSeller
              ? AuthSessionManager.instance.sellerSession
              : AuthSessionManager.instance.customerSession;

          if (current?.refreshToken != null &&
              !AuthSessionManager.isRefreshTokenExpired(current, 1000)) {
            req.extra['_retry'] = true;
            try {
              final refreshed = await refreshAuthSession(useSeller: useSeller);
              if (refreshed != null) {
                req.headers['Authorization'] =
                    'Bearer ${refreshed.accessToken}';
                final cloneResp = await dio.fetch(req);
                return handler.resolve(cloneResp);
              }
            } catch (_) {}
          }

          if (code == 'TOKEN_EXPIRED' ||
              code == 'TOKEN_INVALID' ||
              current != null) {
            await AuthSessionManager.instance.clearSession(
              useSeller: useSeller,
            );
          }
          return handler.next(error);
        },
      ),
    );
  }

  bool _isAuthBypassUrl(String url) {
    const bypass = [
      '/login',
      '/signup',
      '/refresh-token',
      '/logout',
      '/forgot-password',
      '/reset-password',
    ];
    return bypass.any((seg) => url.contains(seg));
  }

  Future<AuthSessionData?> refreshAuthSession({bool useSeller = false}) async {
    if (useSeller && _inFlightSellerRefresh != null) {
      return _inFlightSellerRefresh!;
    }
    if (!useSeller && _inFlightCustomerRefresh != null) {
      return _inFlightCustomerRefresh!;
    }

    final current = useSeller
        ? AuthSessionManager.instance.sellerSession
        : AuthSessionManager.instance.customerSession;

    final refreshToken = current?.refreshToken;
    if (refreshToken == null ||
        AuthSessionManager.isRefreshTokenExpired(current, 1000)) {
      await AuthSessionManager.instance.clearSession(useSeller: useSeller);
      throw Exception('Refresh token expired');
    }

    final future = _refreshDio
        .post(
          ApiEndpoints.refreshToken,
          data: {'refreshToken': refreshToken},
        )
        .then((res) async {
          final map = Map<String, dynamic>.from(res.data as Map);
          return AuthSessionManager.instance.saveSession(
            map,
            useSeller: useSeller,
          );
        })
        .catchError((err) async {
          if (err is DioException) {
            final st = err.response?.statusCode;
            if (st == 401 || st == 403) {
              await AuthSessionManager.instance.clearSession(
                useSeller: useSeller,
              );
            }
          }
          throw err;
        })
        .whenComplete(() {
          if (useSeller) {
            _inFlightSellerRefresh = null;
          } else {
            _inFlightCustomerRefresh = null;
          }
        });

    if (useSeller) {
      _inFlightSellerRefresh = future;
    } else {
      _inFlightCustomerRefresh = future;
    }
    return future;
  }

  // ==================== BEHAVIORAL TELEMETRY (WITH COOKIE CONSENT GUARD) ====================

  void trackInteraction({
    required String eventType,
    String? productId,
    String? category,
    int? dwellMs,
    String? searchQuery,
    int quantity = 1,
  }) {
    if (!AuthSessionManager.instance.isPersonalizationAllowed) return;
    if (eventType == 'DWELL' && (dwellMs == null || dwellMs < 2000)) return;

    dio.post(
      ApiEndpoints.interactions,
      data: {
        'event_type': eventType,
        'product_id': productId,
        'category': category ?? '',
        'dwell_ms': dwellMs ?? 0,
        'search_query': searchQuery ?? '',
        'quantity': quantity,
        'session_id': AuthSessionManager.instance.trackerSessionId,
      },
    ).catchError((_) => Response(requestOptions: RequestOptions()));
  }
}
