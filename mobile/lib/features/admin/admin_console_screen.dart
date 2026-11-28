import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/config/api_endpoints.dart';
import '../../core/network/api_client.dart';
import '../../core/utils/app_utils.dart';
import '../../shared/widgets/shared_widgets.dart';

/// Full Role-Gated Admin Operations Console (Matches Screenshots 11–24 & Admin.js / AdminLayout.js)
/// Includes live pending counter badges on navigation items, Executive Analytics,
/// Inventory Manager with 7 tooltip icon actions, 5-Step Product Wizard, Bulk CSV Update,
/// Orders & Shipments inline status managers + 6-char ID lookup tools, Pickup Stations GPS manager,
/// Sellers Approval manager, Users & Role manager, 30d/365d GDPR Trash Bin, and Audit Logs.
class AdminConsoleScreen extends StatefulWidget {
  final String initialSection;
  final ValueChanged<String> onOpenOrderReceipt;

  const AdminConsoleScreen({
    super.key,
    this.initialSection = 'overview',
    required this.onOpenOrderReceipt,
  });

  @override
  State<AdminConsoleScreen> createState() => _AdminConsoleScreenState();
}

class _AdminConsoleScreenState extends State<AdminConsoleScreen> {
  late String _section;
  Map<String, dynamic> _overview = {};
  List<Map<String, dynamic>> _inventory = [];
  List<Map<String, dynamic>> _sellers = [];
  List<Map<String, dynamic>> _users = [];
  Map<String, dynamic> _trash = {};
  List<Map<String, dynamic>> _logs = [];
  List<Map<String, dynamic>> _orders = [];
  List<Map<String, dynamic>> _shipments = [];
  List<Map<String, dynamic>> _pickupStations = [];

  bool _loading = true;
  String _toast = '';
  String _error = '';

  // Filters
  String _invSearch = '';
  String _invCategory = 'ALL';
  String _invStockFilter = 'ALL';
  String _sellerSearch = '';
  String _userSearch = '';
  String _orderSearch = '';
  String _trashTab = 'products'; // 'products' | 'users'
  String _logCategory = 'ALL';
  String _logSeverity = 'ALL';

  // 5-Step Product Wizard State
  int _wizardStep = 1;
  String? _editingProductId;
  final _pNameCtrl = TextEditingController();
  String _pCategory = 'Fruits and Vegetables';
  final _pBrandCtrl = TextEditingController(text: 'KijaniMart Organics');
  final _pSkuCtrl = TextEditingController();
  final _pOriginCtrl = TextEditingController(text: 'Kenyan Highlands');
  final _pDescCtrl = TextEditingController();
  bool _pOrganic = true;
  final _pImageCtrl = TextEditingController();
  final _pExtraImagesCtrl = TextEditingController();
  final _pPriceCtrl = TextEditingController();
  final _pDiscountCtrl = TextEditingController(text: '0');
  final _pStockCtrl = TextEditingController(text: '50');
  final _pWeightCtrl = TextEditingController(text: '500');
  String _pMeasurement = 'g';
  bool _pFlashSale = false;
  final _pFlashEndsCtrl = TextEditingController();
  final _pShelfLifeCtrl = TextEditingController(text: '7');
  final _pStorageCtrl =
      TextEditingController(text: 'Keep refrigerated at 4°C.');
  final _pCalCtrl = TextEditingController(text: '52 kcal / 100g');
  final _pProtCtrl = TextEditingController(text: '2.4g');
  final _pCarbsCtrl = TextEditingController(text: '9.8g');
  final _pFatCtrl = TextEditingController(text: '0.4g');
  final _pFiberCtrl = TextEditingController(text: '3.2g');
  final _pVitCtrl = TextEditingController(text: 'Vitamin A, Vitamin C, Iron');

  // Bulk CSV State
  String _csvMode = 'UPDATE'; // 'UPDATE' | 'REPLACE'
  final _csvTextCtrl = TextEditingController();

  // Pickup Station Form State
  final _stNameCtrl = TextEditingController();
  final _stCityCtrl = TextEditingController(text: 'Nairobi');
  final _stAreaCtrl = TextEditingController();
  final _stAddressCtrl = TextEditingController();
  final _stLandmarkCtrl = TextEditingController();
  final _stPhoneCtrl = TextEditingController();
  final _stHoursCtrl =
      TextEditingController(text: 'Mon–Sun: 7:00 AM – 9:00 PM');
  final _stLatCtrl = TextEditingController(text: '-1.2615');
  final _stLngCtrl = TextEditingController(text: '36.8021');

  // Manual Audit Log Form
  String _newLogCat = 'SYSTEM';
  String _newLogSev = 'INFO';
  final _newLogDetailsCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _section = widget.initialSection;
    _fetchAllAdminData();
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

  Future<void> _fetchAllAdminData() async {
    setState(() => _loading = true);
    try {
      final results = await Future.wait([
        ApiClient.instance.dio.get(ApiEndpoints.adminOverview),
        ApiClient.instance.dio.get(ApiEndpoints.adminInventory),
        ApiClient.instance.dio.get(ApiEndpoints.adminSellers),
        ApiClient.instance.dio.get(ApiEndpoints.adminUsers),
        ApiClient.instance.dio.get(ApiEndpoints.adminTrash),
        ApiClient.instance.dio.get(
          ApiEndpoints.adminLogs(
            category: _logCategory,
            severity: _logSeverity,
          ),
        ),
        ApiClient.instance.dio.get(ApiEndpoints.ordersPage(1)),
        ApiClient.instance.dio.get(ApiEndpoints.shipmentsPage(1)),
        ApiClient.instance.dio.get(ApiEndpoints.pickupStations),
      ]);

      if (results[0].data is Map) {
        _overview = Map<String, dynamic>.from(results[0].data as Map);
      }
      if (results[1].data is List) {
        _inventory = (results[1].data as List)
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList();
      }
      if (results[2].data is Map && results[2].data['sellers'] is List) {
        _sellers = (results[2].data['sellers'] as List)
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList();
      } else if (results[2].data is List) {
        _sellers = (results[2].data as List)
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList();
      }
      if (results[3].data is List) {
        _users = (results[3].data as List)
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList();
      }
      if (results[4].data is Map) {
        _trash = Map<String, dynamic>.from(results[4].data as Map);
      }
      if (results[5].data is List) {
        _logs = (results[5].data as List)
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList();
      }
      if (results[6].data is Map && results[6].data['orders'] is List) {
        _orders = (results[6].data['orders'] as List)
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList();
      } else if (results[6].data is List) {
        _orders = (results[6].data as List)
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList();
      }
      if (results[7].data is Map && results[7].data['shipments'] is List) {
        _shipments = (results[7].data['shipments'] as List)
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList();
      } else if (results[7].data is List) {
        _shipments = (results[7].data as List)
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList();
      }
      if (results[8].data is List) {
        _pickupStations = (results[8].data as List)
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList();
      }
    } catch (e) {
      setState(() => _error = 'Failed to load admin data.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  // Live Pending Counter Badges (Matches AdminLayout.js)
  int get _pendingInventoryCount => _inventory
      .where((p) =>
          p['approval_status'] == 'PENDING_APPROVAL' ||
          p['has_pending_changes'] == true ||
          ((p['stock'] as num?)?.toInt() ?? 0) <= 10)
      .length;

  int get _pendingSellersCount => _sellers
      .where((s) =>
          (s['seller_profile']?['status'] ?? s['status']) == 'PENDING')
      .length;

  int get _activeOrdersCount => _orders
      .where((o) =>
          !['DELIVERED', 'FULFILLED', 'CANCELLED', 'RETURNED']
              .contains((o['status'] ?? '').toString().toUpperCase()))
      .length;

  int get _trashTotalCount {
    final pLen = (_trash['trashed_products'] as List?)?.length ?? 0;
    final uLen = (_trash['trashed_users'] as List?)?.length ?? 0;
    return pLen + uLen;
  }

  void _openEditWizard(Map<String, dynamic>? prod) {
    setState(() {
      _wizardStep = 1;
      if (prod == null) {
        _editingProductId = null;
        _pNameCtrl.clear();
        _pPriceCtrl.clear();
        _pDiscountCtrl.text = '0';
        _pStockCtrl.text = '50';
        _pDescCtrl.clear();
        _pImageCtrl.clear();
      } else {
        _editingProductId = prod['product_id']?.toString();
        _pNameCtrl.text = (prod['name'] ?? '').toString();
        _pCategory =
            (prod['category'] ?? 'Fruits and Vegetables').toString();
        _pBrandCtrl.text =
            (prod['brand'] ?? 'KijaniMart Organics').toString();
        _pSkuCtrl.text = (prod['sku'] ?? '').toString();
        _pOriginCtrl.text =
            (prod['origin'] ?? 'Kenyan Highlands').toString();
        _pDescCtrl.text = (prod['description'] ?? '').toString();
        _pOrganic = prod['is_organic'] != false;
        _pImageCtrl.text = (prod['image'] ?? '').toString();
        _pPriceCtrl.text = (prod['price'] ?? '').toString();
        _pDiscountCtrl.text = (prod['discount'] ?? '0').toString();
        _pStockCtrl.text = (prod['stock'] ?? '0').toString();
        _pWeightCtrl.text = (prod['weight'] ?? '500').toString();
        _pMeasurement = (prod['measurement'] ?? 'g').toString();
        _pFlashSale = prod['flash_sale'] == true;
      }
      _section = 'new_product';
    });
  }

  Future<void> _saveWizardProduct() async {
    final payload = {
      'name': _pNameCtrl.text.trim(),
      'category': _pCategory,
      'brand': _pBrandCtrl.text.trim(),
      'sku': _pSkuCtrl.text.trim(),
      'origin': _pOriginCtrl.text.trim(),
      'description': _pDescCtrl.text.trim(),
      'is_organic': _pOrganic,
      'image': _pImageCtrl.text.trim(),
      'extra_images': _pExtraImagesCtrl.text.trim(),
      'price': double.tryParse(_pPriceCtrl.text.trim()) ?? 100,
      'discount': int.tryParse(_pDiscountCtrl.text.trim()) ?? 0,
      'stock': int.tryParse(_pStockCtrl.text.trim()) ?? 0,
      'weight': _pWeightCtrl.text.trim(),
      'measurement': _pMeasurement,
      'flash_sale': _pFlashSale,
      'flash_sale_ends_at': _pFlashEndsCtrl.text.trim(),
      'shelf_life_days': int.tryParse(_pShelfLifeCtrl.text.trim()) ?? 7,
      'storage_instructions': _pStorageCtrl.text.trim(),
      'calories': _pCalCtrl.text.trim(),
      'protein': _pProtCtrl.text.trim(),
      'carbs': _pCarbsCtrl.text.trim(),
      'fat': _pFatCtrl.text.trim(),
      'fiber': _pFiberCtrl.text.trim(),
      'vitamins': _pVitCtrl.text.trim(),
    };

    try {
      if (_editingProductId != null) {
        await ApiClient.instance.dio.put(
          ApiEndpoints.adminProductFull(_editingProductId!),
          data: payload,
        );
        _showToast('✓ Product updated in live catalog!');
      } else {
        await ApiClient.instance.dio.post(
          ApiEndpoints.productsBase,
          data: payload,
        );
        _showToast('✓ New product published at top of catalog!');
      }
      setState(() => _section = 'inventory');
      _fetchAllAdminData();
    } on DioException catch (e) {
      setState(() {
        _error = (e.response?.data is Map
                ? e.response?.data['message']?.toString()
                : e.message) ??
            'Failed to save product.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final kpis = _overview['kpis'] is Map
        ? Map<String, dynamic>.from(_overview['kpis'] as Map)
        : <String, dynamic>{};

    final navItems = [
      {'id': 'overview', 'label': 'Analytics', 'icon': Icons.analytics_outlined, 'badge': 0},
      {'id': 'inventory', 'label': 'Inventory', 'icon': Icons.inventory_2_outlined, 'badge': _pendingInventoryCount},
      {'id': 'new_product', 'label': 'Add Product (5-Step)', 'icon': Icons.add_box_outlined, 'badge': 0},
      {'id': 'csv_update', 'label': 'Bulk CSV', 'icon': Icons.upload_file_outlined, 'badge': 0},
      {'id': 'orders', 'label': 'All Orders', 'icon': Icons.receipt_long_outlined, 'badge': _activeOrdersCount},
      {'id': 'shipments', 'label': 'All Shipments', 'icon': Icons.local_shipping_outlined, 'badge': _activeOrdersCount},
      {'id': 'pickup_stations', 'label': 'Pickup Stations', 'icon': Icons.store_mall_directory_outlined, 'badge': 0},
      {'id': 'sellers', 'label': 'Sellers', 'icon': Icons.storefront_outlined, 'badge': _pendingSellersCount},
      {'id': 'users', 'label': 'Users & Roles', 'icon': Icons.people_outline, 'badge': 0},
      {'id': 'trash', 'label': 'Trash & GDPR', 'icon': Icons.delete_sweep_outlined, 'badge': _trashTotalCount},
      {'id': 'logs', 'label': 'Audit Logs', 'icon': Icons.fact_check_outlined, 'badge': 0},
    ];

    return Column(
      children: [
        // Top Horizontal Admin Module Switcher with Live Pending Counter Badges
        Container(
          color: Colors.white,
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: SizedBox(
            height: 38,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 14),
              itemCount: navItems.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (context, idx) {
                final item = navItems[idx];
                final id = item['id'] as String;
                final badge = item['badge'] as int;
                final active = _section == id;
                return InkWell(
                  onTap: () => setState(() => _section = id),
                  borderRadius: BorderRadius.circular(999),
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: active ? KijaniColors.emerald : KijaniColors.slate50,
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(
                        color: active
                            ? KijaniColors.emerald
                            : KijaniColors.slate200,
                      ),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          item['icon'] as IconData,
                          size: 15,
                          color: active ? Colors.white : KijaniColors.slate700,
                        ),
                        const SizedBox(width: 5),
                        Text(
                          item['label'] as String,
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w800,
                            color: active ? Colors.white : KijaniColors.slate700,
                          ),
                        ),
                        if (badge > 0) ...[
                          const SizedBox(width: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 6,
                              vertical: 1,
                            ),
                            decoration: BoxDecoration(
                              color: active
                                  ? Colors.white
                                  : KijaniColors.danger,
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Text(
                              '$badge',
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w900,
                                color: active
                                    ? KijaniColors.emeraldDark
                                    : Colors.white,
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ),

        if (_toast.isNotEmpty)
          Container(
            width: double.infinity,
            color: KijaniColors.emeraldLight,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Text(
              _toast,
              style: const TextStyle(
                color: KijaniColors.emeraldDark,
                fontWeight: FontWeight.w800,
                fontSize: 12.5,
              ),
            ),
          ),
        if (_error.isNotEmpty)
          Container(
            width: double.infinity,
            color: const Color(0xFFFEE2E2),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Text(
              _error,
              style: const TextStyle(
                color: KijaniColors.danger,
                fontWeight: FontWeight.w800,
                fontSize: 12.5,
              ),
            ),
          ),

        Expanded(
          child: _loading
              ? const Center(
                  child:
                      CircularProgressIndicator(color: KijaniColors.emerald),
                )
              : RefreshIndicator(
                  color: KijaniColors.emerald,
                  onRefresh: _fetchAllAdminData,
                  child: _buildActiveSection(kpis),
                ),
        ),
      ],
    );
  }

  Widget _buildActiveSection(Map<String, dynamic> kpis) {
    switch (_section) {
      case 'inventory':
        return _buildInventorySection();
      case 'new_product':
        return _buildWizardSection();
      case 'csv_update':
        return _buildCsvUpdateSection();
      case 'orders':
        return _buildOrdersSection();
      case 'shipments':
        return _buildShipmentsSection();
      case 'pickup_stations':
        return _buildPickupStationsSection();
      case 'sellers':
        return _buildSellersSection();
      case 'users':
        return _buildUsersSection();
      case 'trash':
        return _buildTrashSection();
      case 'logs':
        return _buildLogsSection();
      case 'overview':
      default:
        return _buildOverviewSection(kpis);
    }
  }

  // ==================== 1. EXECUTIVE ANALYTICS & OPERATIONS DASHBOARD (Screenshot 11) ====================
  Widget _buildOverviewSection(Map<String, dynamic> kpis) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text(
          'KIJANIMART ADMIN OPERATIONS',
          style: TextStyle(
            fontSize: 10.5,
            fontWeight: FontWeight.w800,
            color: KijaniColors.emerald,
          ),
        ),
        const Text(
          'Executive Analytics & Operations Dashboard',
          style: TextStyle(
            fontSize: 21,
            fontWeight: FontWeight.w900,
            color: KijaniColors.slate900,
          ),
        ),
        const SizedBox(height: 12),

        // Automated Low-Stock Monitor Banner (Screenshot 11)
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: KijaniColors.slate200),
          ),
          child: Row(
            children: [
              const Icon(Icons.circle, size: 10, color: KijaniColors.emerald),
              const SizedBox(width: 8),
              const Expanded(
                child: Text(
                  'Automated Low-Stock Monitor: Checks every 5 minutes (threshold ≤ 10 units • email reminders max once every 6 hrs)',
                  style: TextStyle(
                    fontSize: 12,
                    color: KijaniColors.slate700,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              OutlinedButton.icon(
                onPressed: () async {
                  await ApiClient.instance.dio
                      .post(ApiEndpoints.adminRunStockScan);
                  _showToast('✓ Low-stock monitor scan completed!');
                  _fetchAllAdminData();
                },
                icon: const Icon(Icons.refresh_rounded, size: 15),
                label: const Text('Run Stock Scan Now'),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),

        // 6 KPI Cards (Screenshot 11)
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          childAspectRatio: 1.45,
          children: [
            _buildKpiTile(
              'TOTAL STORE REVENUE',
              '${PricingUtils.formatKES(kpis['total_revenue'] as num?)} KES',
              'Avg. Order: ${PricingUtils.formatKES(kpis['avg_order_value'] as num?)} KES',
              KijaniColors.emerald,
            ),
            _buildKpiTile(
              'TOTAL ORDERS',
              '${kpis['total_orders'] ?? _orders.length}',
              '${kpis['fulfilled_orders'] ?? 0} Fulfilled • $_activeOrdersCount Active',
              const Color(0xFF2563EB),
            ),
            _buildKpiTile(
              'EXPRESS DISPATCHES',
              '${kpis['delivered_shipments'] ?? 0} Delivered',
              '${_pickupStations.length} Pickup Hubs',
              KijaniColors.amber,
            ),
            _buildKpiTile(
              'CATALOG & STOCK VALUE',
              '${_inventory.length} Products',
              '${PricingUtils.formatKES(kpis['total_stock_value'] as num?)} KES value',
              const Color(0xFF7C3AED),
            ),
            _buildKpiTile(
              'REGISTERED ACCOUNTS',
              '${_users.length} Users',
              '${_sellers.length} Sellers',
              const Color(0xFF4F46E5),
            ),
            _buildKpiTile(
              'PROMOS & STOCK ALERTS',
              '${kpis['flash_sale_count'] ?? 0} Flash Deals',
              '${kpis['low_stock_count'] ?? 0} Low Stock • ${kpis['out_of_stock_count'] ?? 0} Sold Out',
              KijaniColors.danger,
            ),
          ],
        ),
      ],
    );
  }

  // ==================== 2. LIVE PRODUCT & INVENTORY MANAGER (Screenshot 19) ====================
  Widget _buildInventorySection() {
    final filtered = _inventory.where((p) {
      if (_invCategory != 'ALL' && p['category'] != _invCategory) return false;
      final stock = (p['stock'] as num?)?.toInt() ?? 0;
      if (_invStockFilter == 'LOW' && (stock <= 0 || stock > 10)) return false;
      if (_invStockFilter == 'OUT' && stock > 0) return false;
      if (_invStockFilter == 'FLASH' && p['flash_sale'] != true) return false;
      if (_invStockFilter == 'PENDING' &&
          p['approval_status'] != 'PENDING_APPROVAL' &&
          p['has_pending_changes'] != true) {
        return false;
      }
      if (_invSearch.isNotEmpty) {
        final hay =
            '${p['name']} ${p['sku']} ${p['category']} ${p['product_id']}'
                .toLowerCase();
        if (!hay.contains(_invSearch.toLowerCase())) return false;
      }
      return true;
    }).toList();

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Expanded(
              child: Text(
                'Live Product & Inventory Manager',
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w900,
                  color: KijaniColors.slate900,
                ),
              ),
            ),
            ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: KijaniColors.emerald,
                foregroundColor: Colors.white,
              ),
              onPressed: () => _openEditWizard(null),
              icon: const Icon(Icons.add, size: 16),
              label: const Text('Add New Product'),
            ),
          ],
        ),
        const SizedBox(height: 10),
        TextField(
          onChanged: (v) => setState(() => _invSearch = v),
          decoration: InputDecoration(
            hintText: 'Search products by name, ID, SKU, or category...',
            prefixIcon: const Icon(Icons.search),
            filled: true,
            fillColor: Colors.white,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          children: [
            ChoiceChip(
              label: Text('All (${_inventory.length})'),
              selected: _invStockFilter == 'ALL',
              onSelected: (_) => setState(() => _invStockFilter = 'ALL'),
            ),
            ChoiceChip(
              label: const Text('Pending Seller Edits'),
              selected: _invStockFilter == 'PENDING',
              onSelected: (_) => setState(() => _invStockFilter = 'PENDING'),
            ),
            ChoiceChip(
              label: const Text('Low Stock ≤ 10'),
              selected: _invStockFilter == 'LOW',
              onSelected: (_) => setState(() => _invStockFilter = 'LOW'),
            ),
            ChoiceChip(
              label: const Text('Flash Deals'),
              selected: _invStockFilter == 'FLASH',
              onSelected: (_) => setState(() => _invStockFilter = 'FLASH'),
            ),
          ],
        ),
        const SizedBox(height: 12),

        ...filtered.map((prod) {
          final pid = (prod['product_id'] ?? '').toString();
          final stock = (prod['stock'] as num?)?.toInt() ?? 0;
          final hasPendingChanges = prod['has_pending_changes'] == true;
          final approvalStatus =
              (prod['approval_status'] ?? 'APPROVED').toString();

          return Container(
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: hasPendingChanges || approvalStatus == 'PENDING_APPROVAL'
                    ? KijaniColors.amber
                    : KijaniColors.slate200,
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            (prod['name'] ?? '').toString(),
                            style: const TextStyle(
                              fontSize: 14.5,
                              fontWeight: FontWeight.w900,
                              color: KijaniColors.slate900,
                            ),
                          ),
                          Text(
                            '#${prod['sku'] ?? pid.substring(0, 6)} • ${prod['weight']}${prod['measurement']} • ${prod['category']}',
                            style: const TextStyle(
                              fontSize: 11.5,
                              color: KijaniColors.slate500,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          '${PricingUtils.formatKES(prod['price'] as num?)} KES (-${prod['discount'] ?? 0}%)',
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        Text(
                          '$stock units',
                          style: TextStyle(
                            fontSize: 11.5,
                            fontWeight: FontWeight.w800,
                            color: stock <= 10
                                ? KijaniColors.amber
                                : KijaniColors.emerald,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
                if (hasPendingChanges) ...[
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFFFBEB),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: const Color(0xFFFDE68A)),
                    ),
                    child: const Text(
                      '✏️ Seller Edits Pending Admin Approval',
                      style: TextStyle(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w800,
                        color: Color(0xFF92400E),
                      ),
                    ),
                  ),
                ],
                const SizedBox(height: 10),

                // 7 Icon Action Buttons with Tooltips (Matches Screenshot 19)
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    if (hasPendingChanges ||
                        approvalStatus == 'PENDING_APPROVAL') ...[
                      IconActionButton(
                        icon: Icons.fact_check_rounded,
                        tooltip: 'Approve Changes',
                        color: Colors.white,
                        bgColor: KijaniColors.emerald,
                        onPressed: () async {
                          if (hasPendingChanges) {
                            await ApiClient.instance.dio.patch(
                              ApiEndpoints.adminProductPendingChanges(pid),
                              data: {'action': 'APPROVE'},
                            );
                          } else {
                            await ApiClient.instance.dio.patch(
                              ApiEndpoints.adminProductApproval(pid),
                              data: {'approval_status': 'APPROVED'},
                            );
                          }
                          _showToast('✓ Approved product changes!');
                          _fetchAllAdminData();
                        },
                      ),
                      IconActionButton(
                        icon: Icons.cancel_outlined,
                        tooltip: 'Reject Changes',
                        color: KijaniColors.danger,
                        bgColor: const Color(0xFFFEE2E2),
                        onPressed: () async {
                          final reason = await showConfirmActionModal(
                            context,
                            title: 'Reject Product Changes',
                            message:
                                'Provide a reason for rejecting these seller changes:',
                            confirmLabel: 'Reject',
                            showReasonInput: true,
                            requireReason: true,
                          );
                          if (reason == null) return;
                          if (hasPendingChanges) {
                            await ApiClient.instance.dio.patch(
                              ApiEndpoints.adminProductPendingChanges(pid),
                              data: {
                                'action': 'REJECT',
                                'rejection_reason': reason,
                              },
                            );
                          } else {
                            await ApiClient.instance.dio.patch(
                              ApiEndpoints.adminProductApproval(pid),
                              data: {
                                'approval_status': 'REJECTED',
                                'rejection_reason': reason,
                              },
                            );
                          }
                          _showToast('Rejected product changes.');
                          _fetchAllAdminData();
                        },
                      ),
                    ],
                    IconActionButton(
                      icon: Icons.visibility_outlined,
                      tooltip: 'View Product Details',
                      color: const Color(0xFF2563EB),
                      bgColor: const Color(0xFFEFF6FF),
                      onPressed: () => _showProductViewModal(prod),
                    ),
                    IconActionButton(
                      icon: Icons.edit_note_rounded,
                      tooltip: 'Full Edit (5-Step Wizard)',
                      color: KijaniColors.emerald,
                      bgColor: KijaniColors.emeraldLight,
                      onPressed: () => _openEditWizard(prod),
                    ),
                    IconActionButton(
                      icon: Icons.bolt_rounded,
                      tooltip: 'Quick Edit Price/Stock/Flash',
                      color: KijaniColors.slate700,
                      bgColor: KijaniColors.slate50,
                      onPressed: () => _showQuickEditDialog(prod),
                    ),
                    IconActionButton(
                      icon: Icons.delete_outline_rounded,
                      tooltip: 'Move to 30-Day Trash',
                      color: KijaniColors.danger,
                      bgColor: const Color(0xFFFEE2E2),
                      onPressed: () async {
                        final reason = await showConfirmActionModal(
                          context,
                          title: 'Move Product to 30-Day Trash',
                          message:
                              'Move "${prod['name']}" to Trash? It will be retained for 30 days before permanent purge.',
                          confirmLabel: 'Move to Trash',
                          showReasonInput: true,
                        );
                        if (reason == null) return;
                        await ApiClient.instance.dio.delete(
                          ApiEndpoints.adminProductQuick(pid),
                          data: {'reason': reason},
                        );
                        _showToast('Moved "${prod['name']}" to 30-day Trash.');
                        _fetchAllAdminData();
                      },
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

  // ==================== 3. ADD / EDIT PRODUCT 5-STEP WIZARD (Screenshot 20) ====================
  Widget _buildWizardSection() {
    final steps = [
      '1. Basic Details',
      '2. Media Gallery',
      '3. Pricing & Stock',
      '4. Farm & Storage',
      '5. Nutrition & Review',
    ];
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Expanded(
              child: Text(
                _editingProductId != null
                    ? 'Full Edit Product (5-Step Wizard)'
                    : 'Add New Product (5-Step Wizard)',
                style: const TextStyle(
                  fontSize: 19,
                  fontWeight: FontWeight.w900,
                  color: KijaniColors.slate900,
                ),
              ),
            ),
            TextButton(
              onPressed: () => setState(() => _section = 'inventory'),
              child: const Text('← Live Inventory'),
            ),
          ],
        ),
        const SizedBox(height: 10),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: List.generate(steps.length, (i) {
              final stepNum = i + 1;
              final active = _wizardStep == stepNum;
              final done = _wizardStep > stepNum;
              return Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(
                  selected: active,
                  selectedColor: KijaniColors.emerald,
                  labelStyle: TextStyle(
                    color: active ? Colors.white : KijaniColors.slate700,
                    fontWeight: FontWeight.w800,
                    fontSize: 11.5,
                  ),
                  label: Text('${done ? '✓ ' : ''}${steps[i]}'),
                  onSelected: (_) => setState(() => _wizardStep = stepNum),
                ),
              );
            }),
          ),
        ),
        const SizedBox(height: 14),
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: KijaniColors.slate200),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (_wizardStep == 1) ...[
                TextField(
                  controller: _pNameCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Product Name *',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  value: _pCategory,
                  decoration: const InputDecoration(
                    labelText: 'Category *',
                    border: OutlineInputBorder(),
                  ),
                  items: CategoryAisleStrip.categories
                      .where((c) => c['name'] != 'All')
                      .map((c) => DropdownMenuItem(
                            value: c['name'] as String,
                            child: Text(c['name'] as String),
                          ))
                      .toList(),
                  onChanged: (v) {
                    if (v != null) setState(() => _pCategory = v);
                  },
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _pBrandCtrl,
                        decoration: const InputDecoration(
                          labelText: 'Brand',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: TextField(
                        controller: _pOriginCtrl,
                        decoration: const InputDecoration(
                          labelText: 'Origin / Region',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _pDescCtrl,
                  maxLines: 3,
                  decoration: const InputDecoration(
                    labelText: 'Product Description *',
                    border: OutlineInputBorder(),
                  ),
                ),
                CheckboxListTile(
                  value: _pOrganic,
                  activeColor: KijaniColors.emerald,
                  title: const Text('Certified 100% Organic / Naturally Grown'),
                  onChanged: (v) => setState(() => _pOrganic = v ?? true),
                ),
              ] else if (_wizardStep == 2) ...[
                TextField(
                  controller: _pImageCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Primary Card Cover Image URL *',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _pExtraImagesCtrl,
                  maxLines: 2,
                  decoration: const InputDecoration(
                    labelText:
                        'Additional Slider Gallery Image URLs (comma-separated)',
                    border: OutlineInputBorder(),
                  ),
                ),
              ] else if (_wizardStep == 3) ...[
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _pPriceCtrl,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          labelText: 'Base Price (KES) *',
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
                          labelText: 'Discount % (0-90)',
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
                          labelText: 'Weight / Volume (e.g. 500)',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),
                  ],
                ),
                SwitchListTile(
                  value: _pFlashSale,
                  activeColor: KijaniColors.amber,
                  title: const Text('⚡ Feature in Today\'s Flash Sales'),
                  onChanged: (v) => setState(() => _pFlashSale = v),
                ),
                if (_pFlashSale)
                  TextField(
                    controller: _pFlashEndsCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Flash Sale End Date (YYYY-MM-DD)',
                      border: OutlineInputBorder(),
                    ),
                  ),
              ] else if (_wizardStep == 4) ...[
                TextField(
                  controller: _pShelfLifeCtrl,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Shelf Life (Days)',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _pStorageCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Storage Instructions',
                    border: OutlineInputBorder(),
                  ),
                ),
              ] else ...[
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _pCalCtrl,
                        decoration: const InputDecoration(
                          labelText: 'Calories',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: TextField(
                        controller: _pProtCtrl,
                        decoration: const InputDecoration(
                          labelText: 'Protein',
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
                        controller: _pCarbsCtrl,
                        decoration: const InputDecoration(
                          labelText: 'Carbohydrates',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: TextField(
                        controller: _pFatCtrl,
                        decoration: const InputDecoration(
                          labelText: 'Total Fat',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _pVitCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Micronutrients & Vitamins',
                    border: OutlineInputBorder(),
                  ),
                ),
              ],
              const SizedBox(height: 16),
              Wrap(
                alignment: WrapAlignment.spaceBetween,
                spacing: 8,
                runSpacing: 8,
                children: [
                  if (_wizardStep > 1)
                    OutlinedButton(
                      onPressed: () => setState(() => _wizardStep -= 1),
                      child: const Text('← Previous Step'),
                    )
                  else
                    const SizedBox.shrink(),
                  ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: KijaniColors.emerald,
                      foregroundColor: Colors.white,
                    ),
                    onPressed: () {
                      if (_wizardStep < 5) {
                        setState(() => _wizardStep += 1);
                      } else {
                        _saveWizardProduct();
                      }
                    },
                    child: Text(
                      _wizardStep < 5
                          ? 'Next Step →'
                          : (_editingProductId != null
                              ? '✓ Save Product Changes'
                              : '✓ Publish Product to Catalog'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }

  // ==================== 4. BULK CSV INVENTORY UPDATE (Screenshot 21) ====================
  Widget _buildCsvUpdateSection() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text(
          'Bulk CSV Inventory Update',
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.w900,
            color: KijaniColors.slate900,
          ),
        ),
        const SizedBox(height: 8),
        const Text(
          'Required CSV Columns: product_id,name,price,image,weight,measurement,category,stock',
          style: TextStyle(fontSize: 12, color: KijaniColors.slate700),
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            ChoiceChip(
              label: const Text('Update Products by ID (Recommended)'),
              selected: _csvMode == 'UPDATE',
              onSelected: (_) => setState(() => _csvMode = 'UPDATE'),
            ),
            ChoiceChip(
              label: const Text('Replace Entire Catalog'),
              selected: _csvMode == 'REPLACE',
              onSelected: (_) => setState(() => _csvMode = 'REPLACE'),
            ),
          ],
        ),
        const SizedBox(height: 12),
        OutlinedButton.icon(
          onPressed: () async {
            final res = await FilePicker.platform.pickFiles(
              type: FileType.custom,
              allowedExtensions: ['csv'],
              withData: true,
            );
            if (res != null && res.files.single.bytes != null) {
              _csvTextCtrl.text = utf8.decode(res.files.single.bytes!);
            }
          },
          icon: const Icon(Icons.upload_file_rounded),
          label: const Text('Select a CSV Spreadsheet (.csv)'),
        ),
        const SizedBox(height: 10),
        TextField(
          controller: _csvTextCtrl,
          maxLines: 6,
          decoration: const InputDecoration(
            hintText:
                'product_id,name,price,image,weight,measurement,category,stock\nFM-01,Fresh Organic Sukuma Wiki (Kale),45,https://www.themealdb.com/images/ingredients/Kale.png,500,g,Fruits and Vegetables,120',
            filled: true,
            fillColor: Colors.white,
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 12),
        ElevatedButton(
          style: ElevatedButton.styleFrom(
            backgroundColor: KijaniColors.emerald,
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(vertical: 14),
          ),
          onPressed: () async {
            if (_csvTextCtrl.text.trim().isEmpty) return;
            await ApiClient.instance.dio.patch(
              ApiEndpoints.productsBase,
              data: {'csv': _csvTextCtrl.text.trim(), 'mode': _csvMode},
            );
            _showToast('✓ Bulk CSV database update applied!');
            _fetchAllAdminData();
          },
          child: const Text('Apply Bulk CSV Update'),
        ),
      ],
    );
  }

  // ==================== 5. ALL CUSTOMER ORDERS & INLINE STATUS MANAGER (Screenshots 14 & 15) ====================
  Widget _buildOrdersSection() {
    final filtered = _orders.where((o) {
      if (_orderSearch.isEmpty) return true;
      final hay =
          '${o['order_id']} ${o['email']} ${o['name']?['first']} ${o['status']}'
              .toLowerCase();
      return hay.contains(_orderSearch.toLowerCase());
    }).toList();

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text(
          'All Customer Orders & Status Manager',
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.w900,
            color: KijaniColors.slate900,
          ),
        ),
        const SizedBox(height: 10),
        TextField(
          onChanged: (v) => setState(() => _orderSearch = v),
          decoration: InputDecoration(
            hintText: 'Search by 6-char Order ID (#BGOX5U), customer, email...',
            prefixIcon: const Icon(Icons.search),
            filled: true,
            fillColor: Colors.white,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
        ),
        const SizedBox(height: 12),
        ...filtered.map((ord) {
          final oid = (ord['order_id'] ?? '').toString();
          final currentStatus = (ord['status'] ?? 'CREATED').toString();
          final total = (ord['total'] as num?)?.toDouble() ?? 0;

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
                        '#$oid • ${ord['name']?['first'] ?? ''} ${ord['name']?['last'] ?? ''}',
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                    Text(
                      '${PricingUtils.formatKES(total)} KES',
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w900,
                        color: KijaniColors.emerald,
                      ),
                    ),
                  ],
                ),
                Text(
                  '${ord['email'] ?? ''} • ${ord['address']?['delivery_method'] == 'PICKUP_STATION' ? '🏪 Pickup' : '🚚 Doorstep'}',
                  style: const TextStyle(
                    fontSize: 11.5,
                    color: KijaniColors.slate500,
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: DropdownButtonFormField<String>(
                        value: OrderStatusMeta.allFilterStatuses
                                .contains(currentStatus)
                            ? currentStatus
                            : 'CREATED',
                        isDense: true,
                        decoration: const InputDecoration(
                          labelText: 'Quick Status Update',
                          border: OutlineInputBorder(),
                        ),
                        items: OrderStatusMeta.allFilterStatuses
                            .where((s) => s != 'ALL')
                            .map((s) => DropdownMenuItem(
                                  value: s,
                                  child: Text(
                                    OrderStatusMeta.fromCode(s).label,
                                    style: const TextStyle(fontSize: 12),
                                  ),
                                ))
                            .toList(),
                        onChanged: (nextStatus) async {
                          if (nextStatus == null) return;
                          await ApiClient.instance.dio.patch(
                            ApiEndpoints.orderById(oid),
                            data: {'status': nextStatus},
                          );
                          _showToast(
                            '✓ Order #$oid updated to $nextStatus!',
                          );
                          _fetchAllAdminData();
                        },
                      ),
                    ),
                    const SizedBox(width: 8),
                    OutlinedButton(
                      onPressed: () => widget.onOpenOrderReceipt(oid),
                      child: const Text('View & PDF'),
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

  // ==================== 6. ALL SHIPMENTS & EXPRESS DISPATCHES (Screenshots 16 & 17) ====================
  Widget _buildShipmentsSection() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text(
          'All Shipments & Express Dispatches',
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.w900,
            color: KijaniColors.slate900,
          ),
        ),
        const SizedBox(height: 12),
        ..._shipments.map((sh) {
          final oid = (sh['order_id'] ?? '').toString();
          final currentStatus = (sh['status'] ?? 'CREATED').toString();
          return Container(
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: KijaniColors.slate200),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Shipment #$oid',
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      Text(
                        '${sh['address']?['area'] ?? ''}, ${sh['address']?['city'] ?? 'Nairobi'}',
                        style: const TextStyle(
                          fontSize: 12,
                          color: KijaniColors.slate500,
                        ),
                      ),
                    ],
                  ),
                ),
                SizedBox(
                  width: 175,
                  child: DropdownButtonFormField<String>(
                    value: OrderStatusMeta.allFilterStatuses
                            .contains(currentStatus)
                        ? currentStatus
                        : 'CREATED',
                    isDense: true,
                    decoration: const InputDecoration(
                      border: OutlineInputBorder(),
                    ),
                    items: OrderStatusMeta.allFilterStatuses
                        .where((s) => s != 'ALL')
                        .map((s) => DropdownMenuItem(
                              value: s,
                              child: Text(
                                OrderStatusMeta.fromCode(s).label,
                                style: const TextStyle(fontSize: 11.5),
                              ),
                            ))
                        .toList(),
                    onChanged: (nextStatus) async {
                      if (nextStatus == null) return;
                      await ApiClient.instance.dio.patch(
                        ApiEndpoints.shipmentById(oid),
                        data: {'status': nextStatus},
                      );
                      _showToast('✓ Shipment #$oid updated to $nextStatus!');
                      _fetchAllAdminData();
                    },
                  ),
                ),
              ],
            ),
          );
        }),
      ],
    );
  }

  // ==================== 7. MANAGE PICKUP STATIONS WITH GPS & GOOGLE MAPS (Screenshot 18) ====================
  Widget _buildPickupStationsSection() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text(
          'Manage Pickup Stations',
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.w900,
            color: KijaniColors.slate900,
          ),
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
              const Text(
                'Add New Pickup Station',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900),
              ),
              const SizedBox(height: 10),
              OutlinedButton.icon(
                onPressed: () async {
                  try {
                    final pos = await Geolocator.getCurrentPosition();
                    setState(() {
                      _stLatCtrl.text = pos.latitude.toStringAsFixed(4);
                      _stLngCtrl.text = pos.longitude.toStringAsFixed(4);
                    });
                    _showToast('✓ Pinned current GPS coordinates!');
                  } catch (_) {
                    _showToast('Using default Nairobi GPS coordinates.');
                  }
                },
                icon: const Icon(Icons.my_location_rounded, size: 16),
                label: const Text('Use My Current GPS'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _stNameCtrl,
                decoration: const InputDecoration(
                  labelText: 'Pickup Station Name *',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _stCityCtrl,
                      decoration: const InputDecoration(
                        labelText: 'City *',
                        border: OutlineInputBorder(),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: TextField(
                      controller: _stAreaCtrl,
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
                controller: _stAddressCtrl,
                decoration: const InputDecoration(
                  labelText: 'Street / Building Address *',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _stLandmarkCtrl,
                      decoration: const InputDecoration(
                        labelText: 'Landmark',
                        border: OutlineInputBorder(),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: TextField(
                      controller: _stPhoneCtrl,
                      decoration: const InputDecoration(
                        labelText: 'Contact Phone',
                        border: OutlineInputBorder(),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: KijaniColors.emerald,
                  foregroundColor: Colors.white,
                ),
                onPressed: () async {
                  if (_stNameCtrl.text.trim().isEmpty) return;
                  await ApiClient.instance.dio.post(
                    ApiEndpoints.pickupStations,
                    data: {
                      'name': _stNameCtrl.text.trim(),
                      'city': _stCityCtrl.text.trim(),
                      'area': _stAreaCtrl.text.trim(),
                      'address': _stAddressCtrl.text.trim(),
                      'landmark': _stLandmarkCtrl.text.trim(),
                      'phone': _stPhoneCtrl.text.trim(),
                      'opening_hours': _stHoursCtrl.text.trim(),
                      'lat': double.tryParse(_stLatCtrl.text.trim()),
                      'lng': double.tryParse(_stLngCtrl.text.trim()),
                    },
                  );
                  _stNameCtrl.clear();
                  _showToast('✓ Pickup Station added!');
                  _fetchAllAdminData();
                },
                child: const Text('Save Pickup Station'),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        ..._pickupStations.map((st) {
          final id = (st['station_id'] ?? st['_id'] ?? '').toString();
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
                  (st['name'] ?? '').toString(),
                  style: const TextStyle(
                    fontSize: 14.5,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                Text(
                  '${st['address'] ?? ''} • ${st['landmark'] ?? ''} (${st['area'] ?? ''})',
                  style: const TextStyle(
                    fontSize: 12,
                    color: KijaniColors.slate700,
                  ),
                ),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    TextButton.icon(
                      onPressed: () {
                        final q = Uri.encodeComponent(
                          '${st['name']} ${st['area']} Nairobi',
                        );
                        launchUrl(
                          Uri.parse(
                            'https://www.google.com/maps/search/?api=1&query=$q',
                          ),
                        );
                      },
                      icon: const Icon(Icons.map_outlined, size: 15),
                      label: const Text('Open in Google Maps ↗'),
                    ),
                    IconActionButton(
                      icon: Icons.delete_outline_rounded,
                      tooltip: 'Delete Station',
                      color: KijaniColors.danger,
                      bgColor: const Color(0xFFFEE2E2),
                      onPressed: () async {
                        await ApiClient.instance.dio.delete(
                          ApiEndpoints.pickupStationById(id),
                        );
                        _showToast('Removed Pickup Station.');
                        _fetchAllAdminData();
                      },
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

  // ==================== 8. MARKETPLACE SELLERS & APPROVAL REQUESTS (Screenshot 22) ====================
  Widget _buildSellersSection() {
    final filtered = _sellers.where((s) {
      if (_sellerSearch.isEmpty) return true;
      final hay =
          '${s['first_name']} ${s['email']} ${s['seller_profile']?['store_name']}'
              .toLowerCase();
      return hay.contains(_sellerSearch.toLowerCase());
    }).toList();

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text(
          'Marketplace Sellers & Approval Requests',
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.w900,
            color: KijaniColors.slate900,
          ),
        ),
        const SizedBox(height: 10),
        TextField(
          onChanged: (v) => setState(() => _sellerSearch = v),
          decoration: InputDecoration(
            hintText: 'Search sellers by store name, owner, email...',
            prefixIcon: const Icon(Icons.search),
            filled: true,
            fillColor: Colors.white,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
        ),
        const SizedBox(height: 12),
        if (filtered.isEmpty)
          const Padding(
            padding: EdgeInsets.all(28),
            child: Center(child: Text('No seller accounts found.')),
          )
        else
          ...filtered.map((s) {
            final sid = (s['_id'] ?? '').toString();
            final sp = s['seller_profile'] is Map
                ? s['seller_profile'] as Map
                : <String, dynamic>{};
            final status = (sp['status'] ?? s['status'] ?? 'PENDING').toString();
            return Container(
              margin: const EdgeInsets.only(bottom: 10),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: KijaniColors.slate200),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          (sp['store_name'] ?? s['store_name'] ?? 'Seller Store')
                              .toString(),
                          style: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        Text(
                          '${s['first_name'] ?? ''} ${s['last_name'] ?? ''} (${s['email'] ?? ''}) • Status: $status',
                          style: const TextStyle(
                            fontSize: 12,
                            color: KijaniColors.slate500,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Wrap(
                    spacing: 6,
                    children: [
                      IconActionButton(
                        icon: Icons.check_circle_outline_rounded,
                        tooltip: 'Approve Seller Store',
                        color: KijaniColors.emerald,
                        bgColor: KijaniColors.emeraldLight,
                        onPressed: () async {
                          await ApiClient.instance.dio.patch(
                            ApiEndpoints.adminSellerStatus(sid),
                            data: {'status': 'APPROVED'},
                          );
                          _showToast('✓ Seller store approved!');
                          _fetchAllAdminData();
                        },
                      ),
                      IconActionButton(
                        icon: Icons.block_rounded,
                        tooltip: 'Reject / Suspend Store',
                        color: KijaniColors.danger,
                        bgColor: const Color(0xFFFEE2E2),
                        onPressed: () async {
                          final reason = await showConfirmActionModal(
                            context,
                            title: 'Reject or Suspend Seller Store',
                            message: 'Provide a reason for the seller:',
                            confirmLabel: 'Confirm',
                            showReasonInput: true,
                          );
                          if (reason == null) return;
                          await ApiClient.instance.dio.patch(
                            ApiEndpoints.adminSellerStatus(sid),
                            data: {
                              'status': 'REJECTED',
                              'rejection_reason': reason,
                            },
                          );
                          _showToast('Updated seller store status.');
                          _fetchAllAdminData();
                        },
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

  // ==================== 9. USER & ROLE MANAGEMENT (Screenshot 23) ====================
  Widget _buildUsersSection() {
    final filtered = _users.where((u) {
      if (_userSearch.isEmpty) return true;
      final hay = '${u['first_name']} ${u['last_name']} ${u['email']} ${u['role']}'
          .toLowerCase();
      return hay.contains(_userSearch.toLowerCase());
    }).toList();

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text(
          'User & Role Management',
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.w900,
            color: KijaniColors.slate900,
          ),
        ),
        const SizedBox(height: 10),
        TextField(
          onChanged: (v) => setState(() => _userSearch = v),
          decoration: InputDecoration(
            hintText: 'Search users by name or email...',
            prefixIcon: const Icon(Icons.search),
            filled: true,
            fillColor: Colors.white,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
        ),
        const SizedBox(height: 12),
        ...filtered.map((u) {
          final uid = (u['_id'] ?? '').toString();
          final role = (u['role'] ?? 'USER').toString();
          return Container(
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: KijaniColors.slate200),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${u['first_name'] ?? ''} ${u['last_name'] ?? ''} ($role)',
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      Text(
                        '${u['email']} • ${u['orders_count'] ?? 0} orders • ${PricingUtils.formatKES(u['total_spent'] as num?)} KES',
                        style: const TextStyle(
                          fontSize: 11.5,
                          color: KijaniColors.slate500,
                        ),
                      ),
                    ],
                  ),
                ),
                Wrap(
                  spacing: 6,
                  children: [
                    IconActionButton(
                      icon: Icons.admin_panel_settings_outlined,
                      tooltip: role == 'ADMIN'
                          ? 'Demote to Customer'
                          : 'Promote to Admin',
                      color: const Color(0xFF2563EB),
                      bgColor: const Color(0xFFEFF6FF),
                      onPressed: () async {
                        final nextRole = role == 'ADMIN' ? 'USER' : 'ADMIN';
                        await ApiClient.instance.dio.patch(
                          ApiEndpoints.adminUserRole(uid),
                          data: {'role': nextRole},
                        );
                        _showToast('✓ Updated user role to $nextRole');
                        _fetchAllAdminData();
                      },
                    ),
                    IconActionButton(
                      icon: Icons.person_off_outlined,
                      tooltip: 'Suspend User into 365-Day GDPR Trash',
                      color: KijaniColors.danger,
                      bgColor: const Color(0xFFFEE2E2),
                      onPressed: () async {
                        final reason = await showConfirmActionModal(
                          context,
                          title: 'Suspend User (365-Day GDPR Trash)',
                          message:
                              'Suspend ${u['email']} into GDPR Trash for 365 days?',
                          confirmLabel: 'Suspend User',
                          showReasonInput: true,
                        );
                        if (reason == null) return;
                        await ApiClient.instance.dio.delete(
                          ApiEndpoints.adminDeleteUser(uid),
                          data: {'reason': reason},
                        );
                        _showToast('Suspended user into GDPR Trash.');
                        _fetchAllAdminData();
                      },
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

  // ==================== 10. TRASH BIN & GDPR DATA RETENTION (Screenshot 24) ====================
  Widget _buildTrashSection() {
    final trashedProducts = (_trash['trashed_products'] as List?)
            ?.map((e) => Map<String, dynamic>.from(e as Map))
            .toList() ??
        [];
    final trashedUsers = (_trash['trashed_users'] as List?)
            ?.map((e) => Map<String, dynamic>.from(e as Map))
            .toList() ??
        [];

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text(
          'Trash Bin & GDPR Data Retention',
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.w900,
            color: KijaniColors.slate900,
          ),
        ),
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: KijaniColors.slate200),
          ),
          child: Row(
            children: [
              const Expanded(
                child: Text(
                  'Automated Retention Cleanup: Runs daily at 2:00 AM • Products: 30d auto-delete • Users (GDPR): 365d statutory hold',
                  style: TextStyle(fontSize: 12, color: KijaniColors.slate700),
                ),
              ),
              OutlinedButton.icon(
                onPressed: () async {
                  await ApiClient.instance.dio
                      .post(ApiEndpoints.adminTrashPurgeNow);
                  _showToast('✓ Retention cleanup sweep executed!');
                  _fetchAllAdminData();
                },
                icon: const Icon(Icons.cleaning_services_outlined, size: 15),
                label: const Text('Run Cleanup Sweep Now'),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            ChoiceChip(
              label: Text('Trashed Products (${trashedProducts.length}) — 30d'),
              selected: _trashTab == 'products',
              onSelected: (_) => setState(() => _trashTab = 'products'),
            ),
            ChoiceChip(
              label: Text('Suspended Users • GDPR (${trashedUsers.length}) — 365d'),
              selected: _trashTab == 'users',
              onSelected: (_) => setState(() => _trashTab = 'users'),
            ),
          ],
        ),
        const SizedBox(height: 12),

        if (_trashTab == 'products')
          ...trashedProducts.map((p) {
            final pid = (p['product_id'] ?? '').toString();
            return Container(
              margin: const EdgeInsets.only(bottom: 10),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: KijaniColors.slate200),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          (p['name'] ?? '').toString(),
                          style: const TextStyle(fontWeight: FontWeight.w800),
                        ),
                        Text(
                          'Reason: ${p['deletion_reason'] ?? 'Moved to Trash'}',
                          style: const TextStyle(
                            fontSize: 11.5,
                            color: KijaniColors.slate500,
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconActionButton(
                    icon: Icons.restore_rounded,
                    tooltip: 'Restore Product',
                    color: KijaniColors.emerald,
                    bgColor: KijaniColors.emeraldLight,
                    onPressed: () async {
                      await ApiClient.instance.dio
                          .patch(ApiEndpoints.adminRestoreProduct(pid));
                      _showToast('✓ Product restored to live catalog!');
                      _fetchAllAdminData();
                    },
                  ),
                  const SizedBox(width: 6),
                  IconActionButton(
                    icon: Icons.delete_forever_rounded,
                    tooltip: 'Permanent Delete',
                    color: KijaniColors.danger,
                    bgColor: const Color(0xFFFEE2E2),
                    onPressed: () async {
                      await ApiClient.instance.dio.delete(
                        ApiEndpoints.adminPermanentDeleteProduct(pid),
                      );
                      _showToast('Permanently deleted product.');
                      _fetchAllAdminData();
                    },
                  ),
                ],
              ),
            );
          })
        else
          ...trashedUsers.map((u) {
            final uid = (u['_id'] ?? '').toString();
            return Container(
              margin: const EdgeInsets.only(bottom: 10),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: KijaniColors.slate200),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${u['first_name'] ?? ''} ${u['last_name'] ?? ''} (${u['email']})',
                          style: const TextStyle(fontWeight: FontWeight.w800),
                        ),
                        Text(
                          'Suspended by ${u['deleted_by'] ?? 'ADMIN'} • Reason: ${u['suspension_reason'] ?? ''}',
                          style: const TextStyle(
                            fontSize: 11.5,
                            color: KijaniColors.slate500,
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconActionButton(
                    icon: Icons.restore_rounded,
                    tooltip: 'Restore User Account',
                    color: KijaniColors.emerald,
                    bgColor: KijaniColors.emeraldLight,
                    onPressed: () async {
                      await ApiClient.instance.dio
                          .patch(ApiEndpoints.adminRestoreUser(uid));
                      _showToast('✓ Restored user account!');
                      _fetchAllAdminData();
                    },
                  ),
                  const SizedBox(width: 6),
                  IconActionButton(
                    icon: Icons.delete_forever_rounded,
                    tooltip: 'Permanent GDPR Erase',
                    color: KijaniColors.danger,
                    bgColor: const Color(0xFFFEE2E2),
                    onPressed: () async {
                      await ApiClient.instance.dio
                          .delete(ApiEndpoints.adminPermanentDeleteUser(uid));
                      _showToast('Permanently erased user account.');
                      _fetchAllAdminData();
                    },
                  ),
                ],
              ),
            );
          }),
      ],
    );
  }

  // ==================== 11. SYSTEM AUDIT & ACTIVITY LOGS (Screenshot 12) ====================
  Widget _buildLogsSection() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text(
          'System Audit & Activity Logs',
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.w900,
            color: KijaniColors.slate900,
          ),
        ),
        const SizedBox(height: 10),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: KijaniColors.slate200),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Record Operational Log Entry',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w900),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _newLogDetailsCtrl,
                maxLines: 2,
                decoration: const InputDecoration(
                  hintText: 'Describe the operational event or audit check...',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 8),
              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: KijaniColors.emerald,
                  foregroundColor: Colors.white,
                ),
                onPressed: () async {
                  if (_newLogDetailsCtrl.text.trim().isEmpty) return;
                  await ApiClient.instance.dio.post(
                    ApiEndpoints.adminLogs(),
                    data: {
                      'action': 'MANUAL_ADMIN_NOTE',
                      'category': _newLogCat,
                      'severity': _newLogSev,
                      'details': _newLogDetailsCtrl.text.trim(),
                    },
                  );
                  _newLogDetailsCtrl.clear();
                  _showToast('✓ Recorded operational log entry!');
                  _fetchAllAdminData();
                },
                child: const Text('Record Audit Entry'),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        ..._logs.map((log) {
          final sev = (log['severity'] ?? 'INFO').toString();
          return Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: KijaniColors.slate200),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 7,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: sev == 'WARNING'
                            ? const Color(0xFFFEF3C7)
                            : KijaniColors.emeraldLight,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        sev,
                        style: const TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        '${log['action']} (${log['category']})',
                        style: const TextStyle(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  (log['details'] ?? '').toString(),
                  style: const TextStyle(
                    fontSize: 12,
                    color: KijaniColors.slate700,
                  ),
                ),
              ],
            ),
          );
        }),
      ],
    );
  }

  void _showProductViewModal(Map<String, dynamic> prod) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text((prod['name'] ?? '').toString()),
        content: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Category: ${prod['category']}'),
              Text('SKU: ${prod['sku'] ?? prod['product_id']}'),
              Text('Price: ${PricingUtils.formatKES(prod['price'] as num?)} KES'),
              Text('Discount: ${prod['discount'] ?? 0}%'),
              Text('Stock: ${prod['stock']} units'),
              Text('Origin: ${prod['origin'] ?? 'Kenyan Highlands'}'),
              const SizedBox(height: 8),
              Text((prod['description'] ?? '').toString()),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Close'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: KijaniColors.emerald,
              foregroundColor: Colors.white,
            ),
            onPressed: () {
              Navigator.pop(ctx);
              _openEditWizard(prod);
            },
            child: const Text('Open Full 5-Step Edit'),
          ),
        ],
      ),
    );
  }

  void _showQuickEditDialog(Map<String, dynamic> prod) {
    final priceCtrl =
        TextEditingController(text: (prod['price'] ?? 0).toString());
    final discCtrl =
        TextEditingController(text: (prod['discount'] ?? 0).toString());
    final stockCtrl =
        TextEditingController(text: (prod['stock'] ?? 0).toString());
    bool flash = prod['flash_sale'] == true;

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) => AlertDialog(
          title: Text('Quick Edit: ${prod['name']}'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: priceCtrl,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Price (KES)'),
              ),
              TextField(
                controller: discCtrl,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Discount %'),
              ),
              TextField(
                controller: stockCtrl,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Stock Units'),
              ),
              SwitchListTile(
                value: flash,
                title: const Text('Flash Sale'),
                onChanged: (v) => setModalState(() => flash = v),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: KijaniColors.emerald,
                foregroundColor: Colors.white,
              ),
              onPressed: () async {
                await ApiClient.instance.dio.patch(
                  ApiEndpoints.adminProductQuick(
                    (prod['product_id'] ?? '').toString(),
                  ),
                  data: {
                    'price': double.tryParse(priceCtrl.text) ?? prod['price'],
                    'discount': int.tryParse(discCtrl.text) ?? 0,
                    'stock': int.tryParse(stockCtrl.text) ?? 0,
                    'flash_sale': flash,
                  },
                );
                Navigator.pop(ctx);
                _showToast('✓ Quick edit saved!');
                _fetchAllAdminData();
              },
              child: const Text('Save'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildKpiTile(
    String label,
    String value,
    String sub,
    Color accent,
  ) {
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
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 9.5,
              fontWeight: FontWeight.w900,
              color: accent,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w900,
              color: KijaniColors.slate900,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            sub,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 10.5,
              color: KijaniColors.slate500,
            ),
          ),
        ],
      ),
    );
  }
}
