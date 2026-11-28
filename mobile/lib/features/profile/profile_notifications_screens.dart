import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../../core/config/api_endpoints.dart';
import '../../core/network/api_client.dart';
import '../../core/network/auth_session_manager.dart';
import '../../core/utils/app_utils.dart';
import '../../shared/widgets/shared_widgets.dart';

/// 1. Customer Profile, Pending Reviews, Password Rotation & 365-Day GDPR Self-Suspension
/// Matches client/src/components/profile/Profile.js & Screenshot 9
class ProfileScreen extends StatefulWidget {
  final String initialTab; // 'profile' | 'reviews' | 'security'
  final VoidCallback onOpenAdminConsole;
  final VoidCallback onOpenOrders;
  final ValueChanged<String> onOpenOrderReceipt;
  final VoidCallback onSignedOut;

  const ProfileScreen({
    super.key,
    this.initialTab = 'profile',
    required this.onOpenAdminConsole,
    required this.onOpenOrders,
    required this.onOpenOrderReceipt,
    required this.onSignedOut,
  });

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  late String _tab;
  Map<String, dynamic> _stats = {};
  List<Map<String, dynamic>> _recentOrders = [];
  List<Map<String, dynamic>> _pendingReviews = [];
  List<Map<String, dynamic>> _reviewedItems = [];

  final _firstNameCtrl = TextEditingController();
  final _lastNameCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _bioCtrl = TextEditingController();
  final _avatarUrlCtrl = TextEditingController();
  final _cityCtrl = TextEditingController();
  final _areaCtrl = TextEditingController();
  final _streetCtrl = TextEditingController();
  final _buildingCtrl = TextEditingController();

  final _currentPwCtrl = TextEditingController();
  final _newPwCtrl = TextEditingController();
  final _suspendPwCtrl = TextEditingController();
  final _suspendReasonCtrl = TextEditingController();

  bool _loading = true;
  bool _saving = false;
  String _toast = '';
  String _error = '';

  @override
  void initState() {
    super.initState();
    _tab = widget.initialTab;
    _fetchProfileAndReviews();
  }

  Future<void> _fetchProfileAndReviews() async {
    setState(() => _loading = true);
    try {
      final results = await Future.wait([
        ApiClient.instance.dio.get(ApiEndpoints.profile),
        ApiClient.instance.dio.get(ApiEndpoints.pendingReviews),
      ]);

      final profData = results[0].data;
      if (profData is Map) {
        if (profData['user'] is Map) {
          final u = Map<String, dynamic>.from(profData['user'] as Map);
          await AuthSessionManager.instance.updateUserFields(u);
          _firstNameCtrl.text = (u['first_name'] ?? '').toString();
          _lastNameCtrl.text = (u['last_name'] ?? '').toString();
          _phoneCtrl.text = (u['phone'] ?? '').toString();
          _bioCtrl.text = (u['bio'] ?? '').toString();
          _avatarUrlCtrl.text = (u['avatar'] ?? '').toString();
          final addr = u['address'] is Map ? u['address'] as Map : {};
          _cityCtrl.text = (addr['city'] ?? 'Nairobi').toString();
          _areaCtrl.text = (addr['area'] ?? '').toString();
          _streetCtrl.text = (addr['street'] ?? '').toString();
          _buildingCtrl.text = (addr['building_number'] ?? '').toString();
        }
        if (profData['stats'] is Map) {
          _stats = Map<String, dynamic>.from(profData['stats'] as Map);
        }
        if (profData['recent_orders'] is List) {
          _recentOrders = (profData['recent_orders'] as List)
              .map((e) => Map<String, dynamic>.from(e as Map))
              .toList();
        }
      }

      final revData = results[1].data;
      if (revData is Map) {
        _pendingReviews = (revData['pending'] as List?)
                ?.map((e) => Map<String, dynamic>.from(e as Map))
                .toList() ??
            [];
        _reviewedItems = (revData['reviewed'] as List?)
                ?.map((e) => Map<String, dynamic>.from(e as Map))
                .toList() ??
            [];
      }
    } catch (_) {
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _pickAvatarImage() async {
    try {
      final picker = ImagePicker();
      final picked = await picker.pickImage(
        source: ImageSource.gallery,
        maxWidth: 360,
        maxHeight: 360,
        imageQuality: 85,
      );
      if (picked == null) return;
      final bytes = await picked.readAsBytes();
      final dataUrl = 'data:image/jpeg;base64,${base64Encode(bytes)}';
      _avatarUrlCtrl.text = dataUrl;
      await _saveProfile();
    } catch (e) {
      setState(() => _error = 'Could not pick image: $e');
    }
  }

  Future<void> _saveProfile() async {
    setState(() {
      _saving = true;
      _error = '';
      _toast = '';
    });
    try {
      final res = await ApiClient.instance.dio.patch(
        ApiEndpoints.profile,
        data: {
          'first_name': _firstNameCtrl.text.trim(),
          'last_name': _lastNameCtrl.text.trim(),
          'phone': _phoneCtrl.text.trim(),
          'bio': _bioCtrl.text.trim(),
          'avatar': _avatarUrlCtrl.text.trim(),
          'address': {
            'city': _cityCtrl.text.trim(),
            'area': _areaCtrl.text.trim(),
            'street': _streetCtrl.text.trim(),
            'building_number': _buildingCtrl.text.trim(),
          },
        },
      );
      if (res.data is Map && res.data['user'] is Map) {
        await AuthSessionManager.instance.updateUserFields(
          Map<String, dynamic>.from(res.data['user'] as Map),
        );
      }
      setState(() => _toast = '✓ Profile & delivery address updated!');
    } on DioException catch (e) {
      setState(() {
        _error = (e.response?.data is Map
                ? e.response?.data['message']?.toString()
                : e.message) ??
            'Failed to update profile.';
      });
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _changePassword() async {
    if (_newPwCtrl.text.length < 8) {
      setState(
        () => _error = 'New password must be at least 8 characters long.',
      );
      return;
    }
    setState(() {
      _saving = true;
      _error = '';
      _toast = '';
    });
    try {
      await ApiClient.instance.dio.patch(
        ApiEndpoints.changePassword,
        data: {
          'current_password': _currentPwCtrl.text,
          'new_password': _newPwCtrl.text,
        },
      );
      _currentPwCtrl.clear();
      _newPwCtrl.clear();
      setState(
        () => _toast = '✓ Password updated & session tokens rotated!',
      );
    } on DioException catch (e) {
      setState(() {
        _error = (e.response?.data is Map
                ? e.response?.data['message']?.toString()
                : e.message) ??
            'Could not change password.';
      });
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _selfSuspendAccount() async {
    if (_suspendPwCtrl.text.isEmpty) {
      setState(
        () =>
            _error = 'Enter your current password to confirm GDPR suspension.',
      );
      return;
    }
    setState(() {
      _saving = true;
      _error = '';
    });
    try {
      await ApiClient.instance.dio.post(
        ApiEndpoints.suspendAccount,
        data: {
          'password': _suspendPwCtrl.text,
          'reason': _suspendReasonCtrl.text.trim(),
        },
      );
      await AuthSessionManager.instance.clearSession(useSeller: false);
      widget.onSignedOut();
    } on DioException catch (e) {
      setState(() {
        _error = (e.response?.data is Map
                ? e.response?.data['message']?.toString()
                : e.message) ??
            'Account suspension failed.';
      });
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = AuthSessionManager.instance.customerSession;
    if (session == null) return const SizedBox.shrink();

    if (_loading) {
      return const Center(
        child: CircularProgressIndicator(color: KijaniColors.emerald),
      );
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 40),
      children: [
        // Top Profile Hero Card (Screenshot 9)
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
                children: [
                  CircleAvatar(
                    radius: 32,
                    backgroundColor: KijaniColors.emeraldLight,
                    child: Text(
                      session.fullName.characters.first.toUpperCase(),
                      style: const TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w900,
                        color: KijaniColors.emeraldDark,
                      ),
                    ),
                  ),
                  const SizedBox(width: 14),
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
                            color: const Color(0xFFFEF3C7),
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(
                            session.isAdmin
                                ? '🛡️ Store Administrator'
                                : session.isSeller
                                    ? '🏪 Verified Seller'
                                    : '🌿 Verified Customer',
                            style: const TextStyle(
                              fontSize: 10.5,
                              fontWeight: FontWeight.w800,
                              color: Color(0xFFB45309),
                            ),
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          session.fullName,
                          style: const TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w900,
                            color: KijaniColors.slate900,
                          ),
                        ),
                        Text(
                          '${session.email} • ${_phoneCtrl.text}',
                          style: const TextStyle(
                            fontSize: 12,
                            color: KijaniColors.slate500,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  OutlinedButton.icon(
                    onPressed: _pickAvatarImage,
                    icon: const Icon(Icons.upload_rounded, size: 15),
                    label: const Text('Upload Photo'),
                  ),
                  if (session.isAdmin)
                    ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFFFEF3C7),
                        foregroundColor: const Color(0xFF92400E),
                      ),
                      onPressed: widget.onOpenAdminConsole,
                      icon: const Icon(Icons.analytics_outlined, size: 15),
                      label: const Text('Admin Console'),
                    ),
                  ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: KijaniColors.slate900,
                      foregroundColor: Colors.white,
                    ),
                    onPressed: widget.onOpenOrders,
                    icon: const Icon(Icons.local_shipping_outlined, size: 15),
                    label: const Text('Track Orders'),
                  ),
                  OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: KijaniColors.danger,
                    ),
                    onPressed: () async {
                      final rt = session.refreshToken;
                      await AuthSessionManager.instance.clearSession(
                        useSeller: false,
                      );
                      if (rt != null) {
                        ApiClient.instance.dio
                            .post(
                              ApiEndpoints.logout,
                              data: {'refreshToken': rt},
                            )
                            .catchError(
                              (_) => Response(requestOptions: RequestOptions()),
                            );
                      }
                      widget.onSignedOut();
                    },
                    icon: const Icon(Icons.logout_rounded, size: 15),
                    label: const Text('Sign Out'),
                  ),
                ],
              ),
              const SizedBox(height: 14),

              // 5 KPI Summary Cards (Screenshot 9)
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _buildStatChip(
                    'ORDERS PLACED',
                    '${_stats['orders_count'] ?? 0}',
                  ),
                  _buildStatChip(
                    'LIFETIME SPEND',
                    '${PricingUtils.formatKES(_stats['total_spent'] as num?)} KES',
                  ),
                  _buildStatChip(
                    'SAVED WISHLIST',
                    '${session.wishlist.length}',
                  ),
                  _buildStatChip(
                    'ACTIVE BASKET',
                    '${AuthSessionManager.instance.cartCount}',
                  ),
                  _buildStatChip(
                    'PENDING REVIEWS',
                    '${_pendingReviews.length}',
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),

        // 3 Sub-Tabs
        Row(
          children: [
            _buildTabPill('profile', 'Edit Profile & Address'),
            const SizedBox(width: 8),
            _buildTabPill(
              'reviews',
              'Pending Reviews (${_pendingReviews.length})',
            ),
            const SizedBox(width: 8),
            _buildTabPill('security', 'Security & GDPR'),
          ],
        ),
        const SizedBox(height: 12),

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
              ),
            ),
          ),
        if (_error.isNotEmpty)
          Container(
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: const Color(0xFFFEE2E2),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Text(
              _error,
              style: const TextStyle(
                color: KijaniColors.danger,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),

        if (_tab == 'profile')
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
                const Text(
                  'Personal Contact & Default Nairobi Address',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w900,
                    color: KijaniColors.slate900,
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _firstNameCtrl,
                        decoration: const InputDecoration(
                          labelText: 'First Name',
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
                  controller: _phoneCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Phone Number',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _cityCtrl,
                        decoration: const InputDecoration(
                          labelText: 'City',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: TextField(
                        controller: _areaCtrl,
                        decoration: const InputDecoration(
                          labelText: 'Area / Estate',
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
                    labelText: 'Street / Road',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 14),
                ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: KijaniColors.emerald,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 13),
                  ),
                  onPressed: _saving ? null : _saveProfile,
                  child: Text(_saving ? 'Saving...' : 'Save Profile & Address'),
                ),
              ],
            ),
          )
        else if (_tab == 'reviews')
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: KijaniColors.slate200),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Delivered Groceries Awaiting Review (${_pendingReviews.length})',
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w900,
                    color: KijaniColors.slate900,
                  ),
                ),
                const SizedBox(height: 10),
                if (_pendingReviews.isEmpty)
                  const Text(
                    '✓ All delivered items have been rated!',
                    style: TextStyle(color: KijaniColors.slate500),
                  )
                else
                  ..._pendingReviews.map(
                    (item) => ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(
                        (item['name'] ?? 'Grocery Item').toString(),
                        style: const TextStyle(fontWeight: FontWeight.w800),
                      ),
                      subtitle: Text(
                        'Order #${item['order_id']} • ${item['seller_name']}',
                      ),
                      trailing: ElevatedButton(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: KijaniColors.amber,
                          foregroundColor: Colors.white,
                        ),
                        onPressed: () => _showQuickReviewModal(item),
                        child: const Text('Rate ★'),
                      ),
                    ),
                  ),
                if (_reviewedItems.isNotEmpty) ...[
                  const Divider(height: 24),
                  Text(
                    'Your Submitted Reviews (${_reviewedItems.length})',
                    style: const TextStyle(
                      fontSize: 14.5,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 8),
                  ..._reviewedItems.map(
                    (r) => Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Text(
                        '• ${r['name']} (#${r['order_id']}): ★ ${r['review']?['product_rating'] ?? 5}/5 — "${r['review']?['comment'] ?? ''}"',
                        style: const TextStyle(
                          fontSize: 12,
                          color: KijaniColors.slate700,
                        ),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          )
        else
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
                const Text(
                  'Change Account Password',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w900,
                    color: KijaniColors.slate900,
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _currentPwCtrl,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: 'Current Password',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _newPwCtrl,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: 'New Password (min 8 chars)',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 10),
                ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: KijaniColors.emerald,
                    foregroundColor: Colors.white,
                  ),
                  onPressed: _saving ? null : _changePassword,
                  child: const Text('Update Password'),
                ),
                const Divider(height: 28),
                const Text(
                  '🔒 Self-Suspend Account (365-Day GDPR Trash)',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w900,
                    color: KijaniColors.danger,
                  ),
                ),
                const SizedBox(height: 6),
                const Text(
                  'Suspending your account moves your personal profile to GDPR Trash for 365 days in compliance with statutory retention obligations before permanent erasure.',
                  style: TextStyle(
                    fontSize: 12,
                    color: KijaniColors.slate700,
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _suspendPwCtrl,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: 'Confirm Current Password *',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: _suspendReasonCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Reason for suspension (optional)',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 10),
                OutlinedButton(
                  style: OutlinedButton.styleFrom(
                    foregroundColor: KijaniColors.danger,
                    side: const BorderSide(color: KijaniColors.danger),
                  ),
                  onPressed: _saving ? null : _selfSuspendAccount,
                  child: const Text('Suspend My Account into GDPR Trash'),
                ),
              ],
            ),
          ),

        // Recent Orders Card (Screenshot 9)
        if (_recentOrders.isNotEmpty) ...[
          const SizedBox(height: 16),
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
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Text(
                        'Recent Orders (${_recentOrders.length})',
                        style: const TextStyle(
                          fontSize: 15.5,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                    TextButton(
                      onPressed: widget.onOpenOrders,
                      child: const Text('View All →'),
                    ),
                  ],
                ),
                ..._recentOrders.map(
                  (o) => ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(
                      '#${o['order_id']} • ${PricingUtils.formatKES(o['total'] as num?)} KES',
                      style: const TextStyle(
                        fontSize: 13.5,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    subtitle: Text(
                      '${o['items_count'] ?? 1} item(s) • ${o['delivery_method'] == 'PICKUP_STATION' ? 'Pickup Hub' : 'Doorstep'}',
                    ),
                    trailing: TextButton(
                      onPressed: () => widget
                          .onOpenOrderReceipt((o['order_id'] ?? '').toString()),
                      child: const Text('Receipt • Track →'),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }

  Future<void> _showQuickReviewModal(Map<String, dynamic> item) async {
    int pStars = 5;
    int sStars = 5;
    final ctrl = TextEditingController();
    await showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) => AlertDialog(
          title: Text('Rate ${item['name']}'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(
                  5,
                  (i) => IconButton(
                    onPressed: () => setModalState(() => pStars = i + 1),
                    icon: Icon(
                      i < pStars
                          ? Icons.star_rounded
                          : Icons.star_border_rounded,
                      color: KijaniColors.amber,
                    ),
                  ),
                ),
              ),
              TextField(
                controller: ctrl,
                maxLines: 2,
                decoration: const InputDecoration(
                  hintText: 'Write your verified review...',
                  border: OutlineInputBorder(),
                ),
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
                await ApiClient.instance.dio.post(
                  ApiEndpoints.productReviews(
                    (item['product_id'] ?? '').toString(),
                  ),
                  data: {
                    'product_rating': pStars,
                    'seller_rating': sStars,
                    'comment': ctrl.text.trim().isEmpty
                        ? 'Fresh quality and fast delivery!'
                        : ctrl.text.trim(),
                    'order_id': item['order_id'],
                  },
                );
                Navigator.pop(ctx);
                _fetchProfileAndReviews();
              },
              child: const Text('Submit Review'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatChip(String label, String val) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: KijaniColors.slate50,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: KijaniColors.slate200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(
              fontSize: 9.5,
              fontWeight: FontWeight.w800,
              color: KijaniColors.slate500,
            ),
          ),
          Text(
            val,
            style: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w900,
              color: KijaniColors.slate900,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTabPill(String key, String label) {
    final active = _tab == key;
    return Expanded(
      child: InkWell(
        onTap: () => setState(() => _tab = key),
        borderRadius: BorderRadius.circular(10),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: active ? KijaniColors.emerald : Colors.white,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: active ? KijaniColors.emerald : KijaniColors.slate200,
            ),
          ),
          child: Text(
            label,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 11.5,
              fontWeight: FontWeight.w800,
              color: active ? Colors.white : KijaniColors.slate700,
            ),
          ),
        ),
      ),
    );
  }
}

/// 2. Platform & Personal Notifications Center with Instant 0ms Admin All/Mine Toggle
/// Matches client/src/pages/notifications/NotificationsPage.js & Screenshot 13
class NotificationsScreen extends StatefulWidget {
  final ValueChanged<String> onOpenOrder;
  final VoidCallback onOpenAdminConsole;

  const NotificationsScreen({
    super.key,
    required this.onOpenOrder,
    required this.onOpenAdminConsole,
  });

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  List<Map<String, dynamic>> _allNotifications = [];
  String _scope = 'all'; // 'all' | 'mine'
  String _statusFilter = 'ALL'; // 'ALL' | 'UNREAD' | 'READ'
  String _search = '';
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _fetchNotifications();
  }

  Future<void> _fetchNotifications() async {
    setState(() => _loading = true);
    final isAdmin = AuthSessionManager.instance.customerSession?.isAdmin ?? false;
    try {
      final res = await ApiClient.instance.dio.get(
        ApiEndpoints.notifications(scope: isAdmin ? 'all' : 'mine', limit: 60),
      );
      if (res.data is Map && res.data['notifications'] is List) {
        setState(() {
          _allNotifications = (res.data['notifications'] as List)
              .map((e) => Map<String, dynamic>.from(e as Map))
              .toList();
        });
      }
    } catch (_) {
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _markAllRead() async {
    final isAdmin = AuthSessionManager.instance.customerSession?.isAdmin ?? false;
    try {
      await ApiClient.instance.dio.patch(
        ApiEndpoints.markAllNotificationsRead(
          scope: isAdmin ? _scope : 'mine',
        ),
      );
      await _fetchNotifications();
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final isAdmin = AuthSessionManager.instance.customerSession?.isAdmin ?? false;
    final scoped = (isAdmin && _scope == 'mine')
        ? _allNotifications.where((n) => n['is_mine'] == true).toList()
        : _allNotifications;

    final filtered = scoped.where((n) {
      if (_statusFilter == 'UNREAD' && n['read'] == true) return false;
      if (_statusFilter == 'READ' && n['read'] != true) return false;
      if (_search.isNotEmpty) {
        final hay =
            '${n['title'] ?? ''} ${n['message'] ?? ''} ${n['order_id'] ?? ''} ${n['recipient_name'] ?? ''}'
                .toLowerCase();
        if (!hay.contains(_search.toLowerCase())) return false;
      }
      return true;
    }).toList();

    final unreadCount = scoped.where((n) => n['read'] != true).length;

    return RefreshIndicator(
      color: KijaniColors.emerald,
      onRefresh: _fetchNotifications,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 40),
        children: [
          const Text(
            'ADMIN & PERSONAL ACTIVITY FEED',
            style: TextStyle(
              fontSize: 10.5,
              fontWeight: FontWeight.w800,
              color: KijaniColors.emerald,
            ),
          ),
          Text(
            isAdmin ? 'All Platform Notifications' : 'My Notifications',
            style: const TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w900,
              color: KijaniColors.slate900,
            ),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              OutlinedButton.icon(
                onPressed: _fetchNotifications,
                icon: const Icon(Icons.refresh_rounded, size: 16),
                label: const Text('Refresh'),
              ),
              ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  backgroundColor: KijaniColors.emerald,
                  foregroundColor: Colors.white,
                ),
                onPressed: unreadCount > 0 ? _markAllRead : null,
                icon: const Icon(Icons.done_all_rounded, size: 16),
                label: Text('Mark All Read ($unreadCount)'),
              ),
              if (isAdmin)
                OutlinedButton.icon(
                  onPressed: widget.onOpenAdminConsole,
                  icon: const Icon(Icons.admin_panel_settings_outlined, size: 16),
                  label: const Text('Admin Console'),
                ),
            ],
          ),
          if (isAdmin) ...[
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                ChoiceChip(
                  selected: _scope == 'all',
                  selectedColor: KijaniColors.emerald,
                  labelStyle: TextStyle(
                    color: _scope == 'all' ? Colors.white : KijaniColors.slate700,
                    fontWeight: FontWeight.w800,
                  ),
                  label: Text('All Notifications (${_allNotifications.length})'),
                  onSelected: (_) => setState(() => _scope = 'all'),
                ),
                ChoiceChip(
                  selected: _scope == 'mine',
                  selectedColor: KijaniColors.emerald,
                  labelStyle: TextStyle(
                    color:
                        _scope == 'mine' ? Colors.white : KijaniColors.slate700,
                    fontWeight: FontWeight.w800,
                  ),
                  label: Text(
                    'Mine Only (${_allNotifications.where((n) => n['is_mine'] == true).length})',
                  ),
                  onSelected: (_) => setState(() => _scope = 'mine'),
                ),
              ],
            ),
          ],
          const SizedBox(height: 10),
          TextField(
            onChanged: (v) => setState(() => _search = v),
            decoration: InputDecoration(
              hintText:
                  'Search by user name, email, Order ID, or notification message...',
              prefixIcon: const Icon(Icons.search),
              filled: true,
              fillColor: Colors.white,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
          ),
          const SizedBox(height: 12),

          if (_loading)
            const Padding(
              padding: EdgeInsets.all(32),
              child: Center(
                child: CircularProgressIndicator(color: KijaniColors.emerald),
              ),
            )
          else if (filtered.isEmpty)
            const Padding(
              padding: EdgeInsets.all(28),
              child: Center(child: Text('No notifications matching filter.')),
            )
          else
            ...filtered.map((notif) {
              final isRead = notif['read'] == true;
              final orderId = notif['order_id']?.toString();
              return Container(
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: isRead ? Colors.white : KijaniColors.emeraldLight,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: isRead
                        ? KijaniColors.slate200
                        : KijaniColors.emeraldBorder,
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Text(
                            (notif['title'] ?? 'Notification').toString(),
                            style: const TextStyle(
                              fontSize: 13.5,
                              fontWeight: FontWeight.w800,
                              color: KijaniColors.slate900,
                            ),
                          ),
                        ),
                        if (!isRead)
                          const Icon(
                            Icons.circle,
                            size: 9,
                            color: KijaniColors.emerald,
                          ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      (notif['message'] ?? '').toString(),
                      style: const TextStyle(
                        fontSize: 12.5,
                        color: KijaniColors.slate700,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 10,
                      children: [
                        if (orderId != null && orderId.isNotEmpty)
                          OutlinedButton(
                            onPressed: () => widget.onOpenOrder(orderId),
                            child: Text('Open Order #$orderId →'),
                          ),
                        if (!isRead && notif['_id'] != null)
                          TextButton(
                            onPressed: () async {
                              await ApiClient.instance.dio.patch(
                                ApiEndpoints.markNotificationRead(
                                  notif['_id'].toString(),
                                ),
                              );
                              _fetchNotifications();
                            },
                            child: const Text('✓ Mark read'),
                          ),
                      ],
                    ),
                  ],
                ),
              );
            }),
        ],
      ),
    );
  }
}
