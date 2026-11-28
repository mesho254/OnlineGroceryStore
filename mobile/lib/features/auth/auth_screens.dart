import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import '../../core/config/api_endpoints.dart';
import '../../core/network/api_client.dart';
import '../../core/network/auth_session_manager.dart';
import '../../shared/widgets/shared_widgets.dart';

/// Full Authentication Screen supporting:
/// - Sign In (`POST /api/v1/login`)
/// - Create Account (`POST /api/v1/signup`)
/// - Forgot Password (`POST /api/v1/forgot-password`)
/// - Reset Password with Token (`POST /api/v1/reset-password/:token`)
///
/// Visual design: deep-emerald editorial produce hero, segmented
/// Sign In / Create Account switcher, and icon-prefixed filled inputs.
class AuthScreen extends StatefulWidget {
  final String initialMode; // 'LOGIN' | 'SIGNUP' | 'FORGOT' | 'RESET'
  final String? initialMessage;
  final VoidCallback? onAuthenticated;

  const AuthScreen({
    super.key,
    this.initialMode = 'LOGIN',
    this.initialMessage,
    this.onAuthenticated,
  });

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  late String _mode;
  final _firstNameCtrl = TextEditingController();
  final _lastNameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final _resetTokenCtrl = TextEditingController();

  bool _busy = false;
  bool _obscurePassword = true;
  String _error = '';
  String _success = '';

  @override
  void initState() {
    super.initState();
    _mode = widget.initialMode;
    if (widget.initialMessage != null) {
      _error = widget.initialMessage!;
    }
  }

  @override
  void dispose() {
    _firstNameCtrl.dispose();
    _lastNameCtrl.dispose();
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    _resetTokenCtrl.dispose();
    super.dispose();
  }

  void _switchMode(String mode) {
    setState(() {
      _mode = mode;
      _error = '';
      _success = '';
    });
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    setState(() {
      _busy = true;
      _error = '';
      _success = '';
    });

    try {
      if (_mode == 'LOGIN') {
        final res = await ApiClient.instance.dio.post(
          ApiEndpoints.login,
          data: {
            'email': _emailCtrl.text.trim(),
            'password': _passwordCtrl.text,
          },
        );
        await AuthSessionManager.instance.saveSession(
          Map<String, dynamic>.from(res.data as Map),
          useSeller: false,
        );
        widget.onAuthenticated?.call();
      } else if (_mode == 'SIGNUP') {
        final res = await ApiClient.instance.dio.post(
          ApiEndpoints.signup,
          data: {
            'first_name': _firstNameCtrl.text.trim(),
            'last_name': _lastNameCtrl.text.trim(),
            'email': _emailCtrl.text.trim(),
            'password': _passwordCtrl.text,
          },
        );
        await AuthSessionManager.instance.saveSession(
          Map<String, dynamic>.from(res.data as Map),
          useSeller: false,
        );
        widget.onAuthenticated?.call();
      } else if (_mode == 'FORGOT') {
        final res = await ApiClient.instance.dio.post(
          ApiEndpoints.forgotPassword,
          data: {'email': _emailCtrl.text.trim()},
        );
        setState(() {
          _success = (res.data is Map && res.data['message'] != null)
              ? res.data['message'].toString()
              : 'Password reset link sent to your email!';
        });
      } else if (_mode == 'RESET') {
        final res = await ApiClient.instance.dio.post(
          ApiEndpoints.resetPassword(_resetTokenCtrl.text.trim()),
          data: {'password': _passwordCtrl.text},
        );
        setState(() {
          _success = (res.data is Map && res.data['message'] != null)
              ? res.data['message'].toString()
              : 'Password reset! You can now sign in.';
          _mode = 'LOGIN';
        });
      }
    } on DioException catch (e) {
      final msg = e.response?.data is Map
          ? e.response?.data['message']?.toString()
          : e.message;
      setState(() => _error = msg ?? 'Authentication error.');
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String get _heroTitle {
    switch (_mode) {
      case 'SIGNUP':
        return 'Join KijaniMart & Shop Farm-Fresh';
      case 'FORGOT':
        return 'Forgot Your Password?';
      case 'RESET':
        return 'Set a New Password';
      default:
        return 'Welcome Back, Fresh Groceries Await';
    }
  }

  String get _heroSubtitle {
    switch (_mode) {
      case 'SIGNUP':
        return 'Create your account in seconds and get 20-min doorstep delivery.';
      case 'FORGOT':
        return 'Enter your email and we will send you a secure reset link.';
      case 'RESET':
        return 'Paste the token from your email and choose a new password.';
      default:
        return 'Sign in to track orders, save favourites & check out faster.';
    }
  }

  String get _ctaLabel {
    if (_busy) return 'Please wait...';
    switch (_mode) {
      case 'SIGNUP':
        return 'Create Account';
      case 'FORGOT':
        return 'Send Reset Link';
      case 'RESET':
        return 'Save New Password';
      default:
        return 'Sign In';
    }
  }

  @override
  Widget build(BuildContext context) {
    final isPrimaryMode = _mode == 'LOGIN' || _mode == 'SIGNUP';

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 460),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _buildHero(),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.fromLTRB(18, 18, 18, 14),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(24),
                  border: Border.all(color: KijaniColors.slate200),
                  boxShadow: [
                    BoxShadow(
                      color: KijaniColors.slate900.withValues(alpha: 0.05),
                      blurRadius: 22,
                      offset: const Offset(0, 10),
                    ),
                  ],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (isPrimaryMode)
                      _buildModeSwitcher()
                    else
                      Row(
                        children: [
                          IconButton(
                            onPressed: () => _switchMode('LOGIN'),
                            icon: const Icon(Icons.arrow_back_rounded),
                            color: KijaniColors.slate900,
                            style: IconButton.styleFrom(
                              backgroundColor: KijaniColors.slate50,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            _mode == 'FORGOT'
                                ? 'Reset Your Password'
                                : 'Enter New Password',
                            style: const TextStyle(
                              fontSize: 17,
                              fontWeight: FontWeight.w900,
                              color: KijaniColors.slate900,
                            ),
                          ),
                        ],
                      ),
                    const SizedBox(height: 18),
                    if (_error.isNotEmpty)
                      _buildBanner(
                        _error,
                        bg: const Color(0xFFFEF2F2),
                        fg: const Color(0xFFB91C1C),
                        icon: Icons.error_outline_rounded,
                      ),
                    if (_success.isNotEmpty)
                      _buildBanner(
                        _success,
                        bg: KijaniColors.emeraldLight,
                        fg: KijaniColors.emeraldDark,
                        icon: Icons.check_circle_outline_rounded,
                      ),
                    if (_mode == 'SIGNUP') ...[
                      Row(
                        children: [
                          Expanded(
                            child: _buildField(
                              controller: _firstNameCtrl,
                              hint: 'First name',
                              icon: Icons.person_outline_rounded,
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: _buildField(
                              controller: _lastNameCtrl,
                              hint: 'Last name',
                              icon: Icons.badge_outlined,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                    ],
                    if (_mode != 'RESET') ...[
                      _buildField(
                        controller: _emailCtrl,
                        hint: 'Email address',
                        icon: Icons.mail_outline_rounded,
                        keyboardType: TextInputType.emailAddress,
                      ),
                      const SizedBox(height: 12),
                    ],
                    if (_mode == 'RESET') ...[
                      _buildField(
                        controller: _resetTokenCtrl,
                        hint: 'Reset token (from email link)',
                        icon: Icons.key_rounded,
                      ),
                      const SizedBox(height: 12),
                    ],
                    if (_mode != 'FORGOT') ...[
                      _buildField(
                        controller: _passwordCtrl,
                        hint: _mode == 'RESET'
                            ? 'New password (min 8 chars)'
                            : 'Password',
                        icon: Icons.lock_outline_rounded,
                        obscure: _obscurePassword,
                        suffix: IconButton(
                          onPressed: () => setState(
                            () => _obscurePassword = !_obscurePassword,
                          ),
                          icon: Icon(
                            _obscurePassword
                                ? Icons.visibility_outlined
                                : Icons.visibility_off_outlined,
                            color: KijaniColors.slate500,
                            size: 20,
                          ),
                        ),
                      ),
                      if (_mode == 'LOGIN')
                        Align(
                          alignment: Alignment.centerRight,
                          child: TextButton(
                            onPressed: () => _switchMode('FORGOT'),
                            child: const Text(
                              'Forgot password?',
                              style: TextStyle(
                                fontSize: 12.5,
                                fontWeight: FontWeight.w800,
                                color: KijaniColors.emerald,
                              ),
                            ),
                          ),
                        )
                      else
                        const SizedBox(height: 14),
                    ],
                    SizedBox(
                      height: 52,
                      child: ElevatedButton(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: KijaniColors.emerald,
                          foregroundColor: Colors.white,
                          disabledBackgroundColor:
                              KijaniColors.emerald.withValues(alpha: 0.6),
                          elevation: 4,
                          shadowColor:
                              KijaniColors.emerald.withValues(alpha: 0.45),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(16),
                          ),
                        ),
                        onPressed: _busy ? null : _submit,
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            if (_busy)
                              const Padding(
                                padding: EdgeInsets.only(right: 10),
                                child: SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2.2,
                                    color: Colors.white,
                                  ),
                                ),
                              ),
                            Text(
                              _ctaLabel,
                              style: const TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                            if (!_busy) ...[
                              const SizedBox(width: 8),
                              const Icon(Icons.arrow_forward_rounded, size: 19),
                            ],
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 10),
                    if (_mode == 'FORGOT')
                      TextButton(
                        onPressed: () => _switchMode('RESET'),
                        child: const Text(
                          'Already have a reset token?',
                          style: TextStyle(
                            fontWeight: FontWeight.w800,
                            color: KijaniColors.emerald,
                          ),
                        ),
                      ),
                    if (isPrimaryMode)
                      Center(
                        child: TextButton(
                          onPressed: () => _switchMode(
                            _mode == 'LOGIN' ? 'SIGNUP' : 'LOGIN',
                          ),
                          child: RichText(
                            text: TextSpan(
                              style: const TextStyle(
                                fontSize: 13,
                                color: KijaniColors.slate500,
                                fontWeight: FontWeight.w600,
                              ),
                              children: [
                                TextSpan(
                                  text: _mode == 'LOGIN'
                                      ? 'New to KijaniMart? '
                                      : 'Already have an account? ',
                                ),
                                TextSpan(
                                  text: _mode == 'LOGIN'
                                      ? 'Create account'
                                      : 'Sign in',
                                  style: const TextStyle(
                                    color: KijaniColors.emerald,
                                    fontWeight: FontWeight.w900,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              _buildTrustRow(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHero() {
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(26),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xFF064E3B),
            Color(0xFF047857),
            Color(0xFF10B981),
          ],
        ),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF064E3B).withValues(alpha: 0.25),
            blurRadius: 22,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Stack(
        children: [
          Positioned(
            right: -40,
            top: -40,
            child: Container(
              width: 150,
              height: 150,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white.withValues(alpha: 0.08),
              ),
            ),
          ),
          Positioned(
            right: -6,
            bottom: -4,
            child: Image.asset(
              'assets/images/categories/fruits_vegetables.png',
              width: 150,
              fit: BoxFit.contain,
              errorBuilder: (_, __, ___) => const SizedBox.shrink(),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 18, 18, 22),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(3),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const KijaniLogoBadge(size: 30),
                    ),
                    const SizedBox(width: 9),
                    const Text(
                      'KijaniMart',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: const Text(
                    '🌿 100% Farm-Fresh • 20-Min Delivery',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 10.5,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                const SizedBox(height: 10),
                SizedBox(
                  width: 210,
                  child: Text(
                    _heroTitle,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 22,
                      fontWeight: FontWeight.w900,
                      height: 1.15,
                      letterSpacing: -0.3,
                    ),
                  ),
                ),
                const SizedBox(height: 6),
                SizedBox(
                  width: 180,
                  child: Text(
                    _heroSubtitle,
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.82),
                      fontSize: 12,
                      height: 1.4,
                    ),
                  ),
                ),
                const SizedBox(height: 18),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildModeSwitcher() {
    Widget segment(String mode, String label) {
      final active = _mode == mode;
      return Expanded(
        child: GestureDetector(
          onTap: () => _switchMode(mode),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeOutCubic,
            padding: const EdgeInsets.symmetric(vertical: 11),
            decoration: BoxDecoration(
              color: active ? Colors.white : Colors.transparent,
              borderRadius: BorderRadius.circular(12),
              boxShadow: active
                  ? [
                      BoxShadow(
                        color: KijaniColors.slate900.withValues(alpha: 0.08),
                        blurRadius: 10,
                        offset: const Offset(0, 3),
                      ),
                    ]
                  : null,
            ),
            child: Text(
              label,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 13.5,
                fontWeight: active ? FontWeight.w900 : FontWeight.w700,
                color: active ? KijaniColors.emeraldDark : KijaniColors.slate500,
              ),
            ),
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: KijaniColors.slate50,
        borderRadius: BorderRadius.circular(15),
        border: Border.all(color: KijaniColors.slate200),
      ),
      child: Row(
        children: [
          segment('LOGIN', 'Sign In'),
          segment('SIGNUP', 'Create Account'),
        ],
      ),
    );
  }

  Widget _buildField({
    required TextEditingController controller,
    required String hint,
    required IconData icon,
    bool obscure = false,
    TextInputType? keyboardType,
    Widget? suffix,
  }) {
    final baseBorder = OutlineInputBorder(
      borderRadius: BorderRadius.circular(16),
      borderSide: const BorderSide(color: KijaniColors.slate200),
    );
    return TextField(
      controller: controller,
      obscureText: obscure,
      keyboardType: keyboardType,
      style: const TextStyle(
        fontSize: 14,
        fontWeight: FontWeight.w600,
        color: KijaniColors.slate900,
      ),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: const TextStyle(
          fontSize: 13.5,
          color: KijaniColors.slate500,
          fontWeight: FontWeight.w500,
        ),
        prefixIcon: Icon(icon, color: KijaniColors.emerald, size: 20),
        suffixIcon: suffix,
        filled: true,
        fillColor: KijaniColors.slate50,
        contentPadding: const EdgeInsets.symmetric(vertical: 16),
        border: baseBorder,
        enabledBorder: baseBorder,
        focusedBorder: baseBorder.copyWith(
          borderSide: const BorderSide(color: KijaniColors.emerald, width: 1.6),
        ),
      ),
    );
  }

  Widget _buildBanner(
    String message, {
    required Color bg,
    required Color fg,
    required IconData icon,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: fg, size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: TextStyle(
                color: fg,
                fontSize: 12.5,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTrustRow() {
    Widget item(IconData icon, String label) {
      return Expanded(
        child: Column(
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: const BoxDecoration(
                color: KijaniColors.emeraldLight,
                shape: BoxShape.circle,
              ),
              child: Icon(icon, color: KijaniColors.emerald, size: 19),
            ),
            const SizedBox(height: 6),
            Text(
              label,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 10.5,
                fontWeight: FontWeight.w700,
                color: KijaniColors.slate700,
              ),
            ),
          ],
        ),
      );
    }

    return Row(
      children: [
        item(Icons.verified_user_outlined, 'Secure\nCheckout'),
        item(Icons.bolt_rounded, '20-Min\nDelivery'),
        item(Icons.eco_outlined, 'Farm-Fresh\nGuarantee'),
      ],
    );
  }
}
