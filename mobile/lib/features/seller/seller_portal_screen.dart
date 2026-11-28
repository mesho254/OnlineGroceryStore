import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import '../../core/config/api_endpoints.dart';
import '../../core/network/api_client.dart';
import '../../core/network/auth_session_manager.dart';
import '../../core/utils/app_utils.dart';
import '../../shared/widgets/shared_widgets.dart';

/// Standalone KijaniMart Seller Center (Matches client/src/pages/seller/SellerPortal.js & Screenshot 25)
/// Uses the isolated `seller_profile` session (`Options(extra: {'useSellerSession': true})`)
/// so signing in or switching accounts in Seller Center NEVER overwrites the Customer/Admin session.
class SellerPortalScreen extends StatefulWidget {
  final VoidCallback onReturnToStorefront;

  const SellerPortalScreen({
    super.key,
    required this.onReturnToStorefront,
  });

  @override
  State<SellerPortalScreen> createState() => _SellerPortalScreenState();
}

class _SellerPortalScreenState extends State<SellerPortalScreen> {
  String _authMode = 'LOGIN'; // 'LOGIN' | 'REGISTER'
  String _tab = 'overview'; // 'overview' | 'products' | 'orders' | 'ratings' | 'notifications' | 'profile'

  final _loginEmailCtrl = TextEditingController();
  final _loginPwCtrl = TextEditingController();

  final _regFirstCtrl = TextEditingController();
  final _regLastCtrl = TextEditingController();
  final _regEmailCtrl = TextEditingController();
  final _regPwCtrl = TextEditingController();
  final _regPhoneCtrl = TextEditingController();
  final _regStoreNameCtrl = TextEditingController();
  final _regLocationCtrl = TextEditingController(text: 'Nairobi, Kenya');
  String _regCategoryFocus = 'Fruits and Vegetables';
  final _regDescCtrl = TextEditingController();

  Map<String, dynamic> _statusData = {};
  Map<String, dynamic> _overview = {};
  List<Map<String, dynamic>> _myProducts = [];
  List<Map<String, dynamic>> _orders = [];
  Map<String, dynamic> _reviews = {};
  List<Map<String, dynamic>> _notifications = [];

  // Seller 5-Step Product Wizard State
  bool _showProductWizard = false;
  String? _editingProductId;
  final _pNameCtrl = TextEditingController();
  String _pCategory = 'Fruits and Vegetables';
  final _pPriceCtrl = TextEditingController();
  final _pDiscountCtrl = TextEditingController(text: '0');
  final _pStockCtrl = TextEditingController(text: '25');
  final _pWeightCtrl = TextEditingController(text: '500');
  final _pImageCtrl = TextEditingController();
  final _pDescCtrl = TextEditingController();

  bool _busy = false;
  String _toast = '';
  String _error = '';

  Options get _sellerOpts => Options(extra: {'useSellerSession': true});

  @override
  void initState() {
    super.initState();
    if (AuthSessionManager.instance.sellerSession != null) {
      _fetchSellerPortalData();
    }
  }

  void _showToast(String msg) {
    setState(() {
      _toast = msg;
      _error = '';
    });
    Future.delayed(const Duration(seconds: 4), () {
      if (mounted) setState(() => _toast = '');
    });
  }

  Future<void> _handleSellerLogin() async {
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      final res = await ApiClient.instance.dio.post(
        ApiEndpoints.login,
        data: {
          'email': _loginEmailCtrl.text.trim(),
          'password': _loginPwCtrl.text,
        },
        options: _sellerOpts,
      );
      await AuthSessionManager.instance.saveSession(
        Map<String, dynamic>.from(res.data as Map),
        useSeller: true,
      );
      await _fetchSellerPortalData();
    } on DioException catch (e) {
      setState(() {
        _error = (e.response?.data is Map
                ? e.response?.data['message']?.toString()
                : e.message) ??
            'Invalid email or password.';
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _handleSellerRegister() async {
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      final res = await ApiClient.instance.dio.post(
        ApiEndpoints.sellerRegister,
        data: {
          'first_name': _regFirstCtrl.text.trim(),
          'last_name': _regLastCtrl.text.trim(),
          'email': _regEmailCtrl.text.trim(),
          'password': _regPwCtrl.text,
          'phone': _regPhoneCtrl.text.trim(),
          'store_name': _regStoreNameCtrl.text.trim(),
          'business_location': _regLocationCtrl.text.trim(),
          'category_focus': _regCategoryFocus,
          'business_description': _regDescCtrl.text.trim(),
        },
        options: _sellerOpts,
      );
      await AuthSessionManager.instance.saveSession(
        Map<String, dynamic>.from(res.data as Map),
        useSeller: true,
      );
      await _fetchSellerPortalData();
    } on DioException catch (e) {
      setState(() {
        _error = (e.response?.data is Map
                ? e.response?.data['message']?.toString()
                : e.message) ??
            'Seller registration failed.';
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _fetchSellerPortalData() async {
    if (AuthSessionManager.instance.sellerSession == null) return;
    setState(() => _busy = true);
    try {
      final stRes = await ApiClient.instance.dio.get(
        ApiEndpoints.sellerStatus,
        options: _sellerOpts,
      );
      if (stRes.data is Map) {
        _statusData = Map<String, dynamic>.from(stRes.data as Map);
        if (_statusData['user'] is Map) {
          await AuthSessionManager.instance.updateUserFields(
            Map<String, dynamic>.from(_statusData['user'] as Map),
            useSeller: true,
          );
        }
      }

      final sp = _statusData['seller_profile'] is Map
          ? _statusData['seller_profile'] as Map
          : {};
      if (sp['status'] == 'APPROVED') {
        final results = await Future.wait([
          ApiClient.instance.dio.get(
            ApiEndpoints.sellerOverview,
            options: _sellerOpts,
          ),
          ApiClient.instance.dio.get(
            ApiEndpoints.sellerProducts,
            options: _sellerOpts,
          ),
          ApiClient.instance.dio.get(
            ApiEndpoints.sellerOrders,
            options: _sellerOpts,
          ),
          ApiClient.instance.dio.get(
            ApiEndpoints.sellerReviews,
            options: _sellerOpts,
          ),
          ApiClient.instance.dio.get(
            ApiEndpoints.sellerNotifications,
            options: _sellerOpts,
          ),
        ]);

        if (results[0].data is Map) {
          _overview = Map<String, dynamic>.from(results[0].data as Map);
        }
        if (results[1].data is List) {
          _myProducts = (results[1].data as List)
              .map((e) => Map<String, dynamic>.from(e as Map))
              .toList();
        }
        if (results[2].data is Map && results[2].data['orders'] is List) {
          _orders = (results[2].data['orders'] as List)
              .map((e) => Map<String, dynamic>.from(e as Map))
              .toList();
        }
        if (results[3].data is Map) {
          _reviews = Map<String, dynamic>.from(results[3].data as Map);
        }
        if (results[4].data is Map &&
            results[4].data['notifications'] is List) {
          _notifications = (results[4].data['notifications'] as List)
              .map((e) => Map<String, dynamic>.from(e as Map))
              .toList();
        }
      }
    } catch (_) {
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _saveSellerProduct() async {
    final payload = {
      'name': _pNameCtrl.text.trim(),
      'category': _pCategory,
      'price': double.tryParse(_pPriceCtrl.text.trim()) ?? 100,
      'discount': int.tryParse(_pDiscountCtrl.text.trim()) ?? 0,
      'stock': int.tryParse(_pStockCtrl.text.trim()) ?? 10,
      'weight': _pWeightCtrl.text.trim(),
      'measurement': 'g',
      'image': _pImageCtrl.text.trim(),
      'description': _pDescCtrl.text.trim(),
    };

    try {
      if (_editingProductId != null) {
        final res = await ApiClient.instance.dio.patch(
          ApiEndpoints.sellerProductById(_editingProductId!),
          data: payload,
          options: _sellerOpts,
        );
        _showToast(
          (res.data is Map && res.data['message'] != null)
              ? res.data['message'].toString()
              : '✓ Product changes submitted for Admin approval!',
        );
      } else {
        await ApiClient.instance.dio.post(
          ApiEndpoints.sellerProducts,
          data: payload,
          options: _sellerOpts,
        );
        _showToast('✓ Product submitted for Admin review!');
      }
      setState(() => _showProductWizard = false);
      _fetchSellerPortalData();
    } on DioException catch (e) {
      setState(() {
        _error = (e.response?.data is Map
                ? e.response?.data['message']?.toString()
                : e.message) ??
            'Could not save product.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: AuthSessionManager.instance,
      builder: (context, _) {
        final sellerSession = AuthSessionManager.instance.sellerSession;

        return Column(
          children: [
            // Dark Slate Seller Center Header Bar (Screenshot 25)
            Container(
              color: KijaniColors.slate900,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Expanded(
                    child: Row(
                      children: [
                        Icon(
                          Icons.storefront_rounded,
                          color: KijaniColors.emerald,
                          size: 22,
                        ),
                        SizedBox(width: 8),
                        Flexible(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'KijaniMart Seller Center',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 14,
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                              Text(
                                'Isolated Seller Portal Session',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  color: Color(0xFF6EE7B7),
                                  fontSize: 10,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      OutlinedButton.icon(
                        style: OutlinedButton.styleFrom(
                          foregroundColor: Colors.white,
                          side: const BorderSide(color: Colors.white24),
                        ),
                        onPressed: widget.onReturnToStorefront,
                        icon: const Icon(Icons.open_in_new_rounded, size: 14),
                        label: const Text(
                          'Customer Storefront',
                          style: TextStyle(fontSize: 11.5),
                        ),
                      ),
                      if (sellerSession != null) ...[
                        const SizedBox(width: 8),
                        IconButton(
                          tooltip: 'Sign Out of Seller Center',
                          onPressed: () async {
                            final rt = sellerSession.refreshToken;
                            await AuthSessionManager.instance.clearSession(
                              useSeller: true,
                            );
                            if (rt != null) {
                              ApiClient.instance.dio
                                  .post(
                                    ApiEndpoints.logout,
                                    data: {'refreshToken': rt},
                                  )
                                  .catchError(
                                    (_) => Response(
                                      requestOptions: RequestOptions(),
                                    ),
                                  );
                            }
                          },
                          icon: const Icon(
                            Icons.logout_rounded,
                            color: Color(0xFFF87171),
                            size: 18,
                          ),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),

            if (_toast.isNotEmpty)
              Container(
                width: double.infinity,
                color: KijaniColors.emeraldLight,
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: Text(
                  _toast,
                  style: const TextStyle(
                    color: KijaniColors.emeraldDark,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            if (_error.isNotEmpty)
              Container(
                width: double.infinity,
                color: const Color(0xFFFEE2E2),
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: Text(
                  _error,
                  style: const TextStyle(
                    color: KijaniColors.danger,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),

            Expanded(
              child: sellerSession == null
                  ? _buildSellerAuthGateway()
                  : _buildAuthenticatedSellerBody(sellerSession),
            ),
          ],
        );
      },
    );
  }

  // ==================== STATE 1: ISOLATED SELLER LOGIN / REGISTER GATEWAY ====================
  Widget _buildSellerAuthGateway() {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: KijaniColors.slate200),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Expanded(
                    child: ChoiceChip(
                      label: const Text('Seller Sign In'),
                      selected: _authMode == 'LOGIN',
                      onSelected: (_) => setState(() => _authMode = 'LOGIN'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: ChoiceChip(
                      label: const Text('Register Store'),
                      selected: _authMode == 'REGISTER',
                      onSelected: (_) => setState(() => _authMode = 'REGISTER'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              if (_authMode == 'LOGIN') ...[
                TextField(
                  controller: _loginEmailCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Seller Email Address',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _loginPwCtrl,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: 'Password',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 14),
                ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: KijaniColors.emerald,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  onPressed: _busy ? null : _handleSellerLogin,
                  child: Text(
                    _busy ? 'Signing in...' : 'Sign In to Seller Center',
                  ),
                ),
              ] else ...[
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _regFirstCtrl,
                        decoration: const InputDecoration(
                          labelText: 'First Name *',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: TextField(
                        controller: _regLastCtrl,
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
                  controller: _regEmailCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Business Email *',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _regPwCtrl,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: 'Password (min 6 chars) *',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _regStoreNameCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Farm / Store Name *',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _regPhoneCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Business Phone',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 14),
                ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: KijaniColors.emerald,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  onPressed: _busy ? null : _handleSellerRegister,
                  child: Text(
                    _busy
                        ? 'Submitting...'
                        : 'Submit Store for Admin Approval',
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }

  // ==================== STATE 2 & 3: APPROVAL GATE OR FULL 6-TAB SELLER DASHBOARD ====================
  Widget _buildAuthenticatedSellerBody(AuthSessionData sellerSession) {
    final sp = _statusData['seller_profile'] is Map
        ? _statusData['seller_profile'] as Map
        : (sellerSession.user['seller_profile'] is Map
            ? sellerSession.user['seller_profile'] as Map
            : {});
    final status = (sp['status'] ?? 'NONE').toString();

    if (status != 'APPROVED') {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: KijaniColors.slate200),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.hourglass_top_rounded,
                  size: 46,
                  color: KijaniColors.amber,
                ),
                const SizedBox(height: 12),
                Text(
                  status == 'PENDING'
                      ? 'Store Application Pending Admin Approval'
                      : 'Seller Store Status: $status',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Signed in as ${sellerSession.fullName} (${sellerSession.email}). Once an administrator approves your store in Admin → Sellers, your Seller Dashboard will unlock immediately.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 13,
                    color: KijaniColors.slate700,
                  ),
                ),
                const SizedBox(height: 14),
                ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: KijaniColors.emerald,
                    foregroundColor: Colors.white,
                  ),
                  onPressed: _fetchSellerPortalData,
                  icon: const Icon(Icons.refresh_rounded, size: 16),
                  label: const Text('Check Approval Status Now'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    final tabs = [
      {'id': 'overview', 'label': 'Earnings & Overview', 'count': 0},
      {'id': 'products', 'label': 'My Products', 'count': _myProducts.length},
      {'id': 'orders', 'label': 'Orders Received', 'count': _orders.length},
      {'id': 'ratings', 'label': 'Ratings & Reviews', 'count': 0},
      {
        'id': 'notifications',
        'label': 'Notifications',
        'count': _notifications.where((n) => n['read'] != true).length
      },
    ];

    return Column(
      children: [
        Container(
          color: Colors.white,
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: SizedBox(
            height: 36,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 14),
              itemCount: tabs.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (context, idx) {
                final t = tabs[idx];
                final id = t['id'] as String;
                final count = t['count'] as int;
                final active = _tab == id;
                return ChoiceChip(
                  selected: active,
                  selectedColor: KijaniColors.emerald,
                  labelStyle: TextStyle(
                    color: active ? Colors.white : KijaniColors.slate700,
                    fontWeight: FontWeight.w800,
                    fontSize: 12,
                  ),
                  label: Text(
                    '${t['label']}${count > 0 ? ' ($count)' : ''}',
                  ),
                  onSelected: (_) => setState(() {
                    _tab = id;
                    _showProductWizard = false;
                  }),
                );
              },
            ),
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            color: KijaniColors.emerald,
            onRefresh: _fetchSellerPortalData,
            child: _buildSellerTabBody(),
          ),
        ),
      ],
    );
  }

  Widget _buildSellerTabBody() {
    if (_showProductWizard) {
      return ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(
                  _editingProductId != null
                      ? 'Edit Seller Product (Staged for Admin Review)'
                      : 'Add New Seller Product',
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              TextButton(
                onPressed: () => setState(() => _showProductWizard = false),
                child: const Text('Cancel'),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: KijaniColors.slate200),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TextField(
                  controller: _pNameCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Product Name *',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _pPriceCtrl,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          labelText: 'Price (KES) *',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: TextField(
                        controller: _pDiscountCtrl,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          labelText: 'Discount %',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _pStockCtrl,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          labelText: 'Stock Units *',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: TextField(
                        controller: _pWeightCtrl,
                        decoration: const InputDecoration(
                          labelText: 'Weight (g)',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _pImageCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Image URL *',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _pDescCtrl,
                  maxLines: 2,
                  decoration: const InputDecoration(
                    labelText: 'Product Description',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 14),
                ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: KijaniColors.emerald,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  onPressed: _saveSellerProduct,
                  child: Text(
                    _editingProductId != null
                        ? 'Submit Edits for Admin Approval'
                        : 'Submit New Product for Admin Approval',
                  ),
                ),
              ],
            ),
          ),
        ],
      );
    }

    if (_tab == 'products') {
      final pendingEditsCount =
          _myProducts.where((p) => p['has_pending_changes'] == true).length;
      return ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(
                  'My Products (${_myProducts.length})',
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  backgroundColor: KijaniColors.emerald,
                  foregroundColor: Colors.white,
                ),
                onPressed: () {
                  setState(() {
                    _editingProductId = null;
                    _pNameCtrl.clear();
                    _pPriceCtrl.clear();
                    _pImageCtrl.clear();
                    _pDescCtrl.clear();
                    _showProductWizard = true;
                  });
                },
                icon: const Icon(Icons.add, size: 16),
                label: const Text('Add New Product'),
              ),
            ],
          ),
          if (pendingEditsCount > 0) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFEFF6FF),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFFBFDBFE)),
              ),
              child: Text(
                '✏️ Published Product Edits Awaiting Admin Approval: $pendingEditsCount published product(s) have edited details under Admin review. Shoppers continue seeing the previous published details until Admin approves the changes.',
                style: const TextStyle(
                  fontSize: 12,
                  color: Color(0xFF1E40AF),
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
          const SizedBox(height: 12),
          ..._myProducts.map((p) {
            final pid = (p['product_id'] ?? '').toString();
            final hasPending = p['has_pending_changes'] == true;
            return Container(
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
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Text(
                          (p['name'] ?? '').toString(),
                          style: const TextStyle(
                            fontSize: 14.5,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ),
                      Text(
                        '${PricingUtils.formatKES(PricingUtils.getEffectivePrice(p))} KES • ${p['stock']} left',
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w800,
                          color: KijaniColors.emerald,
                        ),
                      ),
                    ],
                  ),
                  if (hasPending)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFFFBEB),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: const Color(0xFFFDE68A)),
                        ),
                        child: const Text(
                          '✏️ Edits Pending Admin Approval',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                            color: Color(0xFF92400E),
                          ),
                        ),
                      ),
                    ),
                  const SizedBox(height: 8),
                  Wrap(
                    alignment: WrapAlignment.end,
                    spacing: 8,
                    runSpacing: 6,
                    children: [
                      OutlinedButton(
                        onPressed: () {
                          setState(() {
                            _editingProductId = pid;
                            _pNameCtrl.text = (p['name'] ?? '').toString();
                            _pPriceCtrl.text = (p['price'] ?? '').toString();
                            _pDiscountCtrl.text =
                                (p['discount'] ?? '0').toString();
                            _pStockCtrl.text = (p['stock'] ?? '0').toString();
                            _pImageCtrl.text = (p['image'] ?? '').toString();
                            _pDescCtrl.text =
                                (p['description'] ?? '').toString();
                            _showProductWizard = true;
                          });
                        },
                        child: const Text('Edit'),
                      ),
                      TextButton(
                        style: TextButton.styleFrom(
                          foregroundColor: KijaniColors.danger,
                        ),
                        onPressed: () async {
                          await ApiClient.instance.dio.delete(
                            ApiEndpoints.sellerProductById(pid),
                            options: _sellerOpts,
                          );
                          _showToast('Removed product from seller catalog.');
                          _fetchSellerPortalData();
                        },
                        child: const Text('Delete'),
                      ),
                    ],
                  ),
                ],
              ),
            );
          }),
        ],
      );
    }

    if (_tab == 'orders') {
      return ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            'Orders Received (${_orders.length})',
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 12),
          ..._orders.map((ord) {
            final oid = (ord['order_id'] ?? '').toString();
            final currentStatus =
                (ord['status'] ?? 'WAITING_TO_BE_SHIPPED').toString();
            return Container(
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
                  Text(
                    'Order #$oid • Status: $currentStatus',
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 8),
                  DropdownButtonFormField<String>(
                    value: OrderStatusMeta.sellerProposableStatuses
                            .contains(currentStatus)
                        ? currentStatus
                        : 'WAITING_TO_BE_SHIPPED',
                    decoration: const InputDecoration(
                      labelText: 'Propose Status Update to Admin Queue',
                      border: OutlineInputBorder(),
                    ),
                    items: OrderStatusMeta.sellerProposableStatuses
                        .map((s) => DropdownMenuItem(
                              value: s,
                              child: Text(OrderStatusMeta.fromCode(s).label),
                            ))
                        .toList(),
                    onChanged: (nextStatus) async {
                      if (nextStatus == null) return;
                      await ApiClient.instance.dio.patch(
                        ApiEndpoints.sellerProposeOrderStatus(oid),
                        data: {
                          'status': nextStatus,
                          'note': 'Updated from KijaniMart Seller Mobile App',
                        },
                        options: _sellerOpts,
                      );
                      _showToast(
                        '✓ Proposed status "$nextStatus" sent to Admin Orders queue!',
                      );
                      _fetchSellerPortalData();
                    },
                  ),
                ],
              ),
            );
          }),
        ],
      );
    }

    if (_tab == 'ratings') {
      final revList = (_reviews['reviews'] as List?)
              ?.map((e) => Map<String, dynamic>.from(e as Map))
              .toList() ??
          [];
      return ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text(
            'Verified Customer Ratings & Reviews',
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 12),
          if (revList.isEmpty)
            const Text('No verified reviews yet.')
          else
            ...revList.map(
              (r) => Card(
                child: ListTile(
                  title: Text('${r['product_name'] ?? 'Product'} • ★ ${r['seller_rating'] ?? 5}/5'),
                  subtitle: Text('"${r['comment'] ?? ''}" — ${r['user_name'] ?? 'Buyer'}'),
                ),
              ),
            ),
        ],
      );
    }

    if (_tab == 'notifications') {
      return ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(
                  'Seller Notifications (${_notifications.length})',
                  style:
                      const TextStyle(fontSize: 20, fontWeight: FontWeight.w900),
                ),
              ),
              TextButton(
                onPressed: () async {
                  await ApiClient.instance.dio.patch(
                    ApiEndpoints.sellerMarkAllNotificationsRead,
                    options: _sellerOpts,
                  );
                  _fetchSellerPortalData();
                },
                child: const Text('Mark All Read'),
              ),
            ],
          ),
          ..._notifications.map(
            (n) => Card(
              child: ListTile(
                title: Text((n['title'] ?? '').toString()),
                subtitle: Text((n['message'] ?? '').toString()),
              ),
            ),
          ),
        ],
      );
    }

    // Default: Earnings & Overview Tab
    final kpis = _overview['kpis'] is Map
        ? Map<String, dynamic>.from(_overview['kpis'] as Map)
        : <String, dynamic>{};
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text(
          'Seller Earnings & Store Overview',
          style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900),
        ),
        const SizedBox(height: 12),
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          childAspectRatio: 1.5,
          children: [
            _buildSellerKpi(
              'NET EARNINGS',
              '${PricingUtils.formatKES(kpis['net_earnings'] as num?)} KES',
            ),
            _buildSellerKpi(
              'UNITS SOLD',
              '${kpis['total_units_sold'] ?? 0}',
            ),
            _buildSellerKpi(
              'ACTIVE PRODUCTS',
              '${_myProducts.length}',
            ),
            _buildSellerKpi(
              'STORE RATING',
              '★ ${kpis['avg_seller_rating'] ?? '4.9'}',
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildSellerKpi(String label, String val) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: KijaniColors.slate200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            label,
            style: const TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w800,
              color: KijaniColors.emerald,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            val,
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w900,
              color: KijaniColors.slate900,
            ),
          ),
        ],
      ),
    );
  }
}
