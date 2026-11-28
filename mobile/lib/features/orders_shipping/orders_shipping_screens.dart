import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/config/api_endpoints.dart';
import '../../core/network/api_client.dart';
import '../../core/utils/app_utils.dart';
import '../../shared/widgets/shared_widgets.dart';

/// 1. Track Your Orders & Shipments Hub (Matches client/src/pages/shipment/Shipment.js & Screenshot 5)
/// Includes 6-character Order ID lookup, 3 KPI summary cards, 13 status filter chips,
/// 6-step horizontal progress stepper, and Order Receipt / POS PDF inspection.
class OrdersShipmentsHubScreen extends StatefulWidget {
  final ValueChanged<String> onOpenOrderDetails;

  const OrdersShipmentsHubScreen({
    super.key,
    required this.onOpenOrderDetails,
  });

  @override
  State<OrdersShipmentsHubScreen> createState() =>
      _OrdersShipmentsHubScreenState();
}

class _OrdersShipmentsHubScreenState extends State<OrdersShipmentsHubScreen> {
  final _lookupCtrl = TextEditingController();
  List<Map<String, dynamic>> _orders = [];
  String _statusFilter = 'ALL';
  bool _loading = true;
  String _error = '';

  @override
  void initState() {
    super.initState();
    _fetchOrders();
  }

  Future<void> _fetchOrders() async {
    setState(() {
      _loading = true;
      _error = '';
    });
    try {
      final res = await ApiClient.instance.dio.get(ApiEndpoints.myOrders);
      if (res.data is List) {
        setState(() {
          _orders = (res.data as List)
              .map((e) => Map<String, dynamic>.from(e as Map))
              .toList();
        });
      }
    } catch (e) {
      setState(() => _error = 'Could not load your orders.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final completedCount = _orders.where((o) {
      final st = (o['shipment_status'] ?? o['status'] ?? '').toString();
      return st == 'DELIVERED' || st == 'FULFILLED';
    }).length;
    final activeCount = _orders.where((o) {
      final st = (o['shipment_status'] ?? o['status'] ?? '').toString();
      return !['DELIVERED', 'FULFILLED', 'CANCELLED', 'RETURNED', 'REFUNDED']
          .contains(st);
    }).length;

    final filtered = _orders.where((o) {
      if (_statusFilter == 'ALL') return true;
      final st =
          (o['shipment_status'] ?? o['status'] ?? 'CREATED').toString().toUpperCase();
      return st == _statusFilter;
    }).toList();

    return RefreshIndicator(
      color: KijaniColors.emerald,
      onRefresh: _fetchOrders,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 40),
        children: [
          // Green Live Delivery & Shipment Hub Header (Screenshot 5)
          Container(
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
                  'LIVE DELIVERY & SHIPMENT HUB',
                  style: TextStyle(
                    color: Color(0xFFA7F3D0),
                    fontSize: 10.5,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.7,
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Track Your Orders & Shipments',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 22,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  'View real-time dispatch progress for all your recent orders below, or look up any shipment by its 6-character Order ID.',
                  style: TextStyle(
                    color: Colors.white70,
                    fontSize: 12.5,
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _lookupCtrl,
                        textCapitalization: TextCapitalization.characters,
                        decoration: InputDecoration(
                          hintText: 'Enter 6-character Order ID (e.g. BGOX5U)',
                          filled: true,
                          fillColor: Colors.white,
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 14,
                            vertical: 10,
                          ),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: BorderSide.none,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: KijaniColors.slate900,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 13,
                        ),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      onPressed: () {
                        final id = _lookupCtrl.text
                            .trim()
                            .replaceAll('#', '')
                            .toUpperCase();
                        if (id.isNotEmpty) {
                          widget.onOpenOrderDetails(id);
                        }
                      },
                      child: const Text(
                        'Track →',
                        style: TextStyle(fontWeight: FontWeight.w800),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),

          // 3 KPI Summary Cards (Screenshot 5)
          Row(
            children: [
              _buildKpiCard(
                Icons.receipt_long_rounded,
                'TOTAL ORDERS',
                '${_orders.length}',
                KijaniColors.emerald,
              ),
              const SizedBox(width: 10),
              _buildKpiCard(
                Icons.delivery_dining_rounded,
                'ACTIVE / IN TRANSIT',
                '$activeCount',
                KijaniColors.amber,
              ),
              const SizedBox(width: 10),
              _buildKpiCard(
                Icons.check_circle_outline_rounded,
                'DELIVERED',
                '$completedCount',
                const Color(0xFF2563EB),
              ),
            ],
          ),
          const SizedBox(height: 18),

          Text(
            'Your Orders & Shipments (${_orders.length})',
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w900,
              color: KijaniColors.slate900,
            ),
          ),
          const SizedBox(height: 10),

          // 13 Canonical Status Filter Chips
          SizedBox(
            height: 36,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: OrderStatusMeta.allFilterStatuses.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (context, idx) {
                final stCode = OrderStatusMeta.allFilterStatuses[idx];
                final meta = OrderStatusMeta.fromCode(stCode);
                final isSelected = _statusFilter == stCode;
                return ChoiceChip(
                  selected: isSelected,
                  selectedColor: KijaniColors.emerald,
                  labelStyle: TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w800,
                    color: isSelected ? Colors.white : KijaniColors.slate700,
                  ),
                  label: Text(stCode == 'ALL' ? 'All (${_orders.length})' : meta.label),
                  onSelected: (_) => setState(() => _statusFilter = stCode),
                );
              },
            ),
          ),
          const SizedBox(height: 14),

          if (_loading)
            const Padding(
              padding: EdgeInsets.all(32),
              child: Center(
                child: CircularProgressIndicator(color: KijaniColors.emerald),
              ),
            )
          else if (_error.isNotEmpty)
            Text(_error, style: const TextStyle(color: KijaniColors.danger))
          else if (filtered.isEmpty)
            Container(
              padding: const EdgeInsets.all(28),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: KijaniColors.slate200),
              ),
              child: const Center(
                child: Text(
                  'No orders found for the selected status.',
                  style: TextStyle(
                    fontSize: 13.5,
                    color: KijaniColors.slate500,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            )
          else
            ...filtered.map((ord) {
              final orderId = (ord['order_id'] ?? '').toString();
              final status =
                  (ord['shipment_status'] ?? ord['status'] ?? 'CREATED')
                      .toString();
              final meta = OrderStatusMeta.fromCode(status);
              final total = (ord['total'] as num?)?.toDouble() ?? 0;
              final products = (ord['products'] as List?)
                      ?.map((e) => Map<String, dynamic>.from(e as Map))
                      .toList() ??
                  [];
              final addr = ord['address'] is Map
                  ? Map<String, dynamic>.from(ord['address'] as Map)
                  : <String, dynamic>{};
              final isPickup = addr['delivery_method'] == 'PICKUP_STATION';

              return InkWell(
                onTap: () => widget.onOpenOrderDetails(orderId),
                borderRadius: BorderRadius.circular(18),
                child: Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(color: KijaniColors.slate200),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Expanded(
                            child: Wrap(
                              spacing: 8,
                              runSpacing: 6,
                              crossAxisAlignment: WrapCrossAlignment.center,
                              children: [
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 10,
                                    vertical: 4,
                                  ),
                                  decoration: BoxDecoration(
                                    color: KijaniColors.slate900,
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: Text(
                                    '#$orderId',
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontFamily: 'monospace',
                                      fontSize: 12.5,
                                      fontWeight: FontWeight.w900,
                                    ),
                                  ),
                                ),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 8,
                                    vertical: 3,
                                  ),
                                  decoration: BoxDecoration(
                                    color: KijaniColors.slate50,
                                    borderRadius: BorderRadius.circular(999),
                                  ),
                                  child: Text(
                                    isPickup
                                        ? '🏪 Pickup Station'
                                        : '🚚 Doorstep Delivery',
                                    style: const TextStyle(
                                      fontSize: 10.5,
                                      fontWeight: FontWeight.w700,
                                      color: KijaniColors.slate700,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 9,
                                  vertical: 3.5,
                                ),
                                decoration: BoxDecoration(
                                  color: meta.bgColor,
                                  borderRadius: BorderRadius.circular(999),
                                ),
                                child: Text(
                                  meta.label.toUpperCase(),
                                  style: TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w900,
                                    color: meta.textColor,
                                  ),
                                ),
                              ),
                              const SizedBox(height: 3),
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
                        ],
                      ),
                      const SizedBox(height: 12),

                      // 6-Step Progress Bar
                      if (meta.stepIndex > 0)
                        Row(
                          children: List.generate(
                            OrderStatusMeta.sixProgressSteps.length,
                            (idx) {
                              final reached = (idx + 1) <= meta.stepIndex;
                              return Expanded(
                                child: Container(
                                  height: 5,
                                  margin: const EdgeInsets.only(right: 4),
                                  decoration: BoxDecoration(
                                    color: reached
                                        ? KijaniColors.emerald
                                        : KijaniColors.slate200,
                                    borderRadius: BorderRadius.circular(999),
                                  ),
                                ),
                              );
                            },
                          ),
                        ),
                      const SizedBox(height: 10),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Expanded(
                            child: Text(
                              '${products.length} Item(s): ${products.map((p) => '${p['quantity'] ?? 1}x ${p['name'] ?? 'Item'}').join(', ')}',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 12,
                                color: KijaniColors.slate700,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                          const Text(
                            'Receipt & POS PDF →',
                            style: TextStyle(
                              fontSize: 11.5,
                              fontWeight: FontWeight.w800,
                              color: KijaniColors.emerald,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              );
            }),
        ],
      ),
    );
  }

  Widget _buildKpiCard(
    IconData icon,
    String label,
    String value,
    Color accent,
  ) {
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
            Icon(icon, color: accent, size: 20),
            const SizedBox(height: 6),
            Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 9.5,
                fontWeight: FontWeight.w800,
                color: KijaniColors.slate500,
              ),
            ),
            Text(
              value,
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w900,
                color: KijaniColors.slate900,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// 2. Order Receipt, Chronological Status History & 80mm Thermal POS PDF Receipt Downloader
/// Matches client/src/pages/order/id/OrderId.js
class OrderReceiptDetailScreen extends StatefulWidget {
  final String orderId;
  final VoidCallback onBack;
  final void Function(String productId, String orderId)? onRateDeliveredProduct;

  const OrderReceiptDetailScreen({
    super.key,
    required this.orderId,
    required this.onBack,
    this.onRateDeliveredProduct,
  });

  @override
  State<OrderReceiptDetailScreen> createState() =>
      _OrderReceiptDetailScreenState();
}

class _OrderReceiptDetailScreenState extends State<OrderReceiptDetailScreen> {
  Map<String, dynamic>? _order;
  Map<String, dynamic>? _shipment;
  bool _loading = true;
  bool _downloadingPdf = false;
  String _toast = '';

  @override
  void initState() {
    super.initState();
    _fetchDetails();
  }

  Future<void> _fetchDetails() async {
    setState(() => _loading = true);
    try {
      final results = await Future.wait([
        ApiClient.instance.dio
            .get(ApiEndpoints.orderById(widget.orderId))
            .catchError((_) => Response(requestOptions: RequestOptions())),
        ApiClient.instance.dio
            .get(ApiEndpoints.shipmentById(widget.orderId))
            .catchError((_) => Response(requestOptions: RequestOptions())),
      ]);
      if (results[0].data is Map) {
        _order = Map<String, dynamic>.from(results[0].data as Map);
      }
      if (results[1].data is Map) {
        _shipment = Map<String, dynamic>.from(results[1].data as Map);
      }
    } catch (_) {
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _downloadPosReceiptPdf() async {
    setState(() {
      _downloadingPdf = true;
      _toast = '';
    });
    try {
      final res = await ApiClient.instance.dio.get<List<int>>(
        ApiEndpoints.orderReceiptPdf(widget.orderId),
        options: Options(responseType: ResponseType.bytes),
      );
      final bytes = res.data;
      if (bytes != null && bytes.isNotEmpty) {
        final dir = await getTemporaryDirectory();
        final file =
            File('${dir.path}/KijaniMart-Receipt-${widget.orderId}.pdf');
        await file.writeAsBytes(bytes, flush: true);
        await Share.shareXFiles(
          [XFile(file.path, mimeType: 'application/pdf')],
          subject: 'KijaniMart POS Receipt #${widget.orderId}',
        );
        if (mounted) {
          setState(
            () => _toast =
                '✓ Thermal POS PDF Receipt #${widget.orderId} downloaded!',
          );
        }
      }
    } catch (_) {
      // Fallback: open PDF endpoint in external browser
      final uri = Uri.tryParse(ApiEndpoints.orderReceiptPdf(widget.orderId));
      if (uri != null) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      }
    } finally {
      if (mounted) setState(() => _downloadingPdf = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(
        child: CircularProgressIndicator(color: KijaniColors.emerald),
      );
    }
    final ord = _order ?? _shipment;
    if (ord == null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text('Order #${widget.orderId} was not found.'),
            TextButton(onPressed: widget.onBack, child: const Text('← Go Back')),
          ],
        ),
      );
    }

    final status =
        (_shipment?['status'] ?? _order?['status'] ?? 'CREATED').toString();
    final meta = OrderStatusMeta.fromCode(status);
    final total = ((_order?['total'] ?? _shipment?['total']) as num?)?.toDouble() ?? 0;
    final products = ((_order?['products'] ?? _shipment?['products']) as List?)
            ?.map((e) => Map<String, dynamic>.from(e as Map))
            .toList() ??
        [];
    final history =
        ((_shipment?['status_history'] ?? _order?['status_history']) as List?)
                ?.map((e) => Map<String, dynamic>.from(e as Map))
                .toList() ??
            [];
    final isDelivered =
        status.toUpperCase() == 'DELIVERED' || status.toUpperCase() == 'FULFILLED';

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 40),
      children: [
        Wrap(
          alignment: WrapAlignment.spaceBetween,
          crossAxisAlignment: WrapCrossAlignment.center,
          spacing: 8,
          runSpacing: 8,
          children: [
            TextButton.icon(
              onPressed: widget.onBack,
              icon: const Icon(Icons.arrow_back_rounded, size: 17),
              label: const Text('All Orders & Shipments'),
            ),
            ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: KijaniColors.slate900,
                foregroundColor: Colors.white,
              ),
              onPressed: _downloadingPdf ? null : _downloadPosReceiptPdf,
              icon: const Icon(Icons.picture_as_pdf_rounded, size: 16),
              label: Text(
                _downloadingPdf
                    ? 'Generating POS PDF...'
                    : 'Download POS Receipt (PDF)',
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        if (_toast.isNotEmpty)
          Container(
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: KijaniColors.emeraldLight,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Text(
              _toast,
              style: const TextStyle(
                color: KijaniColors.emeraldDark,
                fontWeight: FontWeight.w700,
                fontSize: 12.5,
              ),
            ),
          ),

        // Header Status Card
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
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'ORDER RECEIPT & LIVE STATUS',
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w800,
                            color: KijaniColors.emerald,
                          ),
                        ),
                        Text(
                          'Order #${widget.orderId}',
                          style: const TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.w900,
                            color: KijaniColors.slate900,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: meta.bgColor,
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(
                          meta.label.toUpperCase(),
                          style: TextStyle(
                            fontSize: 10.5,
                            fontWeight: FontWeight.w900,
                            color: meta.textColor,
                          ),
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '${PricingUtils.formatKES(total)} KES',
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w900,
                          color: KijaniColors.emerald,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: KijaniColors.slate50,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  'Order Status: ${meta.label} — ${meta.description}',
                  style: const TextStyle(
                    fontSize: 12.5,
                    color: KijaniColors.slate700,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),

        // Chronological Order & Shipment Status History
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
                'Order & Shipment Status History',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w900,
                  color: KijaniColors.slate900,
                ),
              ),
              const SizedBox(height: 12),
              ...(history.isNotEmpty
                      ? history
                      : [
                          {
                            'status': status,
                            'timestamp': ord['ordered_at'] ??
                                DateTime.now().toIso8601String(),
                            'note': meta.description,
                          }
                        ])
                  .map((step) {
                final stepMeta =
                    OrderStatusMeta.fromCode(step['status']?.toString());
                return Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(
                        Icons.check_circle_rounded,
                        color: Color(0xFF0284C7),
                        size: 20,
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 2.5,
                              ),
                              decoration: BoxDecoration(
                                color: const Color(0xFF0284C7),
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Text(
                                stepMeta.label.toUpperCase(),
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 10,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                            ),
                            const SizedBox(height: 3),
                            Text(
                              (step['timestamp'] ?? '')
                                  .toString()
                                  .split('T')
                                  .first,
                              style: const TextStyle(
                                fontSize: 11.5,
                                color: KijaniColors.slate500,
                              ),
                            ),
                            if (step['note'] != null &&
                                step['note'].toString().isNotEmpty)
                              Text(
                                step['note'].toString(),
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: KijaniColors.slate700,
                                ),
                              ),
                          ],
                        ),
                      ),
                    ],
                  ),
                );
              }),
            ],
          ),
        ),
        const SizedBox(height: 14),

        // Itemized Receipt Products
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
                'Itemized POS Receipt Summary',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w900,
                  color: KijaniColors.slate900,
                ),
              ),
              const SizedBox(height: 10),
              ...products.map((item) {
                final pid = (item['product_id'] ?? '').toString();
                final qty = (item['quantity'] as num?)?.toInt() ?? 1;
                final price = (item['price'] as num?)?.toDouble() ?? 0;
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '${qty}x ${item['name'] ?? 'Grocery Item'}',
                              style: const TextStyle(
                                fontSize: 13.5,
                                fontWeight: FontWeight.w800,
                                color: KijaniColors.slate900,
                              ),
                            ),
                            if (isDelivered &&
                                pid.isNotEmpty &&
                                widget.onRateDeliveredProduct != null)
                              InkWell(
                                onTap: () => widget.onRateDeliveredProduct!(
                                  pid,
                                  widget.orderId,
                                ),
                                child: const Padding(
                                  padding: EdgeInsets.only(top: 3),
                                  child: Text(
                                    '★ Rate Product & Seller →',
                                    style: TextStyle(
                                      fontSize: 11.5,
                                      fontWeight: FontWeight.w800,
                                      color: KijaniColors.amber,
                                    ),
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                      Text(
                        '${PricingUtils.formatKES(price * qty)} KES',
                        style: const TextStyle(
                          fontSize: 13.5,
                          fontWeight: FontWeight.w800,
                          color: KijaniColors.slate900,
                        ),
                      ),
                    ],
                  ),
                );
              }),
            ],
          ),
        ),
      ],
    );
  }
}
