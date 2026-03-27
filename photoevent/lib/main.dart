import 'package:flutter/material.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    const base = Color(0xFF0F1724);
    const panel = Color(0xFF182335);
    const accent = Color(0xFFFFB65C);

    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'PhotoEvent Mobile',
      theme: ThemeData(
        useMaterial3: true,
        scaffoldBackgroundColor: base,
        colorScheme: const ColorScheme.dark(
          primary: accent,
          secondary: Color(0xFF6CE5D8),
          surface: panel,
        ),
      ),
      home: const PhotoEventHomePage(),
    );
  }
}

enum AppRole { host, guest }

class PhotoEventHomePage extends StatefulWidget {
  const PhotoEventHomePage({super.key});

  @override
  State<PhotoEventHomePage> createState() => _PhotoEventHomePageState();
}

class _PhotoEventHomePageState extends State<PhotoEventHomePage> {
  AppRole _role = AppRole.host;

  final List<EventRoom> _rooms = const [
    EventRoom(
      title: 'Gaurav Birthday',
      subtitle: 'Patna • 24 March • 6:30 PM',
      inviteCode: 'GVR24',
      qrState: 'QR live',
      hostName: 'Ashraf',
      photosCollected: 428,
      guestsJoined: 36,
      uploadsLive: 12,
      aiAlbumsReady: 4,
      mainPerson: 'Gaurav',
      matchedMainPersonPhotos: 39,
      shareAlbumTitle: 'Gaurav Highlights',
    ),
    EventRoom(
      title: 'Reception Night',
      subtitle: 'City Palace Lawn • 29 March',
      inviteCode: 'RCP09',
      qrState: 'Collecting uploads',
      hostName: 'Ali',
      photosCollected: 182,
      guestsJoined: 18,
      uploadsLive: 5,
      aiAlbumsReady: 2,
      mainPerson: 'Bride & Groom',
      matchedMainPersonPhotos: 24,
      shareAlbumTitle: 'Reception Best Shots',
    ),
  ];

  int _selectedRoomIndex = 0;

  EventRoom get _activeRoom => _rooms[_selectedRoomIndex];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 18, 20, 28),
          children: [
            _HeroBanner(role: _role, room: _activeRoom),
            const SizedBox(height: 18),
            _ModeSwitcher(
              role: _role,
              onChanged: (role) => setState(() => _role = role),
            ),
            const SizedBox(height: 18),
            _RoomPicker(
              rooms: _rooms,
              selectedIndex: _selectedRoomIndex,
              onSelect: (index) => setState(() => _selectedRoomIndex = index),
            ),
            const SizedBox(height: 18),
            if (_role == AppRole.host) ...[
              _HostEventSummary(room: _activeRoom),
              const SizedBox(height: 18),
              _HostFlowPanel(room: _activeRoom),
              const SizedBox(height: 18),
              _HostOperationsPanel(room: _activeRoom),
              const SizedBox(height: 18),
              _HostAlbumPanel(room: _activeRoom),
            ] else ...[
              _GuestJoinPanel(room: _activeRoom),
              const SizedBox(height: 18),
              _GuestFlowPanel(room: _activeRoom),
              const SizedBox(height: 18),
              _GuestUploadPanel(room: _activeRoom),
              const SizedBox(height: 18),
              _GuestAlbumPanel(room: _activeRoom),
            ],
          ],
        ),
      ),
    );
  }
}

class _HeroBanner extends StatelessWidget {
  const _HeroBanner({required this.role, required this.room});

  final AppRole role;
  final EventRoom room;

  @override
  Widget build(BuildContext context) {
    final subtitle = role == AppRole.host
        ? 'Run the event, collect guest uploads, review AI albums, and open QR sharing from one mobile app.'
        : 'Join the event, upload from your phone, and open the shared album in the same mobile app.';

    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(28),
        gradient: const LinearGradient(
          colors: [Color(0xFF1A263A), Color(0xFF0F1724)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'PHOTOEVENT MOBILE',
            style: Theme.of(context).textTheme.labelMedium?.copyWith(
              letterSpacing: 2.8,
              color: const Color(0xFFFFB65C),
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 14),
          Text(
            'One app for Host and Guest',
            style: Theme.of(context).textTheme.headlineMedium?.copyWith(
              color: Colors.white,
              fontWeight: FontWeight.w700,
              height: 1.04,
            ),
          ),
          const SizedBox(height: 12),
          Text(
            subtitle,
            style: Theme.of(context).textTheme.bodyLarge?.copyWith(
              color: Colors.white.withValues(alpha: 0.74),
              height: 1.45,
            ),
          ),
          const SizedBox(height: 18),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              _TopPill(
                label: role == AppRole.host ? 'Host mode' : 'Guest mode',
              ),
              _TopPill(label: room.qrState),
              _TopPill(label: '${room.photosCollected} photos'),
              _TopPill(label: '${room.aiAlbumsReady} AI albums'),
            ],
          ),
        ],
      ),
    );
  }
}

class _ModeSwitcher extends StatelessWidget {
  const _ModeSwitcher({required this.role, required this.onChanged});

  final AppRole role;
  final ValueChanged<AppRole> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(6),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.04),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Row(
        children: [
          Expanded(
            child: _ModeButton(
              title: 'Host',
              icon: Icons.workspace_premium_rounded,
              selected: role == AppRole.host,
              onTap: () => onChanged(AppRole.host),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: _ModeButton(
              title: 'Guest',
              icon: Icons.people_alt_rounded,
              selected: role == AppRole.guest,
              onTap: () => onChanged(AppRole.guest),
            ),
          ),
        ],
      ),
    );
  }
}

class _ModeButton extends StatelessWidget {
  const _ModeButton({
    required this.title,
    required this.icon,
    required this.selected,
    required this.onTap,
  });

  final String title;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Ink(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          color: selected ? const Color(0xFFFFB65C) : Colors.transparent,
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              icon,
              color: selected
                  ? const Color(0xFF101826)
                  : Colors.white.withValues(alpha: 0.78),
            ),
            const SizedBox(width: 10),
            Text(
              title,
              style: TextStyle(
                color: selected ? const Color(0xFF101826) : Colors.white,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _RoomPicker extends StatelessWidget {
  const _RoomPicker({
    required this.rooms,
    required this.selectedIndex,
    required this.onSelect,
  });

  final List<EventRoom> rooms;
  final int selectedIndex;
  final ValueChanged<int> onSelect;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 108,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: rooms.length,
        separatorBuilder: (_, _) => const SizedBox(width: 12),
        itemBuilder: (context, index) {
          final room = rooms[index];
          final selected = index == selectedIndex;
          return InkWell(
            onTap: () => onSelect(index),
            borderRadius: BorderRadius.circular(24),
            child: Ink(
              width: 240,
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(24),
                color: selected
                    ? const Color(0x26FFB65C)
                    : Colors.white.withValues(alpha: 0.04),
                border: Border.all(
                  color: selected
                      ? const Color(0x66FFB65C)
                      : Colors.white.withValues(alpha: 0.08),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    room.title,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                      fontSize: 16,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    room.subtitle,
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.7),
                      height: 1.35,
                    ),
                  ),
                  const Spacer(),
                  Text(
                    'Invite ${room.inviteCode}',
                    style: TextStyle(
                      color: selected
                          ? const Color(0xFFFFD4A0)
                          : Colors.white.withValues(alpha: 0.78),
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

class _HostEventSummary extends StatelessWidget {
  const _HostEventSummary({required this.room});

  final EventRoom room;

  @override
  Widget build(BuildContext context) {
    return _Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _PanelHeading(
            eyebrow: 'HOST OVERVIEW',
            title: room.title,
            trailing: _StatusChip(label: room.qrState),
          ),
          const SizedBox(height: 10),
          Text(
            room.subtitle,
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.7),
              height: 1.4,
            ),
          ),
          const SizedBox(height: 18),
          const Row(
            children: [
              Expanded(
                child: _MetricTile(
                  label: 'Compression',
                  value: 'Sharp + libvips',
                ),
              ),
              SizedBox(width: 12),
              Expanded(
                child: _MetricTile(
                  label: 'Face match',
                  value: 'Reference photo',
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _MetricTile(
                  label: 'Guests live',
                  value: '${room.uploadsLive}',
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _MetricTile(
                  label: 'AI albums',
                  value: '${room.aiAlbumsReady}',
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _MetricTile(label: 'QR state', value: room.qrState),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _HostFlowPanel extends StatelessWidget {
  const _HostFlowPanel({required this.room});

  final EventRoom room;

  @override
  Widget build(BuildContext context) {
    return _Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _PanelHeading(
            eyebrow: 'HOST FLOW',
            title: 'Create, collect, review, share',
          ),
          const SizedBox(height: 18),
          const _FlowStep(
            step: '1',
            title: 'Create event room',
            detail:
                'Set the event name, choose the main person, and generate the guest entry code.',
          ),
          const SizedBox(height: 12),
          const _FlowStep(
            step: '2',
            title: 'Open QR or invite code',
            detail:
                'Guests scan once and join the same event room from their own phone.',
          ),
          const SizedBox(height: 12),
          const _FlowStep(
            step: '3',
            title: 'Collect uploads in parallel',
            detail:
                'Guest photos are compressed and added to the event while the host keeps monitoring the room.',
          ),
          const SizedBox(height: 12),
          _FlowStep(
            step: '4',
            title: 'Review AI album',
            detail:
                '${room.mainPerson} is matched from the reference photo and grouped into a ready-to-share album.',
          ),
        ],
      ),
    );
  }
}

class _HostOperationsPanel extends StatelessWidget {
  const _HostOperationsPanel({required this.room});

  final EventRoom room;

  @override
  Widget build(BuildContext context) {
    return _Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _PanelHeading(
            eyebrow: 'HOST TOOLS',
            title: 'Everything runs from one phone',
          ),
          const SizedBox(height: 18),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            children: [
              _ActionCard(
                title: 'Create Event',
                detail: 'Set the room, main person, and guest access rules.',
                icon: Icons.add_box_rounded,
              ),
              _ActionCard(
                title: 'Show QR Join',
                detail: 'Guests scan and enter the event room instantly.',
                icon: Icons.qr_code_rounded,
              ),
              _ActionCard(
                title: 'Approve Album',
                detail: 'Review the AI album before opening the share handoff.',
                icon: Icons.auto_awesome_motion_rounded,
              ),
            ],
          ),
          const SizedBox(height: 18),
          _CodeCard(
            title: 'Live guest join code',
            code: room.inviteCode,
            subtitle:
                'Host and guest use the same app. The mode only changes the workflow.',
          ),
        ],
      ),
    );
  }
}

class _HostAlbumPanel extends StatelessWidget {
  const _HostAlbumPanel({required this.room});

  final EventRoom room;

  @override
  Widget build(BuildContext context) {
    return _Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _PanelHeading(
            eyebrow: 'AI ALBUM',
            title: room.shareAlbumTitle,
            trailing: _StatusChip(
              label: '${room.matchedMainPersonPhotos} matched',
            ),
          ),
          const SizedBox(height: 18),
          Row(
            children: [
              Expanded(
                child: _MetricTile(
                  label: 'Main person',
                  value: room.mainPerson,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _MetricTile(
                  label: 'Photos matched',
                  value: '${room.matchedMainPersonPhotos}',
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
          const _PreviewStrip(
            items: [
              _PreviewTile(
                title: 'Main person photos',
                subtitle: 'Reference-photo match',
              ),
              _PreviewTile(
                title: 'Blur removed',
                subtitle: 'Smart quality filter',
              ),
              _PreviewTile(title: 'QR share ready', subtitle: 'Album handoff'),
            ],
          ),
        ],
      ),
    );
  }
}

class _GuestJoinPanel extends StatelessWidget {
  const _GuestJoinPanel({required this.room});

  final EventRoom room;

  @override
  Widget build(BuildContext context) {
    return _Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _PanelHeading(
            eyebrow: 'GUEST JOIN',
            title: 'Join ${room.title}',
            trailing: const _StatusChip(label: 'Ready to join'),
          ),
          const SizedBox(height: 12),
          Text(
            'Use the QR from the host or enter the invite code to join the room, upload from your phone, and open the shared album.',
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.72),
              height: 1.45,
            ),
          ),
          const SizedBox(height: 18),
          _CodeCard(
            title: 'Invite code',
            code: room.inviteCode,
            subtitle:
                'Single app. Guest mode joins the same event room already opened by the host.',
          ),
        ],
      ),
    );
  }
}

class _GuestFlowPanel extends StatelessWidget {
  const _GuestFlowPanel({required this.room});

  final EventRoom room;

  @override
  Widget build(BuildContext context) {
    return _Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _PanelHeading(
            eyebrow: 'GUEST FLOW',
            title: 'Join, upload, and browse',
          ),
          const SizedBox(height: 18),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            children: const [
              _ActionCard(
                title: 'Scan QR',
                detail: 'Open the event room directly from the host handoff.',
                icon: Icons.qr_code_scanner_rounded,
              ),
              _ActionCard(
                title: 'Upload Photos',
                detail:
                    'Pick images from the phone gallery and send them in parallel.',
                icon: Icons.cloud_upload_rounded,
              ),
              _ActionCard(
                title: 'Open Album',
                detail:
                    'See the host-approved album and download selected moments.',
                icon: Icons.photo_library_rounded,
              ),
            ],
          ),
          const SizedBox(height: 18),
          Row(
            children: const [
              Expanded(
                child: _MetricTile(label: 'Upload flow', value: 'Parallel'),
              ),
              SizedBox(width: 12),
              Expanded(
                child: _MetricTile(label: 'Entry', value: 'QR + code'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _GuestUploadPanel extends StatelessWidget {
  const _GuestUploadPanel({required this.room});

  final EventRoom room;

  @override
  Widget build(BuildContext context) {
    const uploads = [
      GuestUpload(name: 'IMG_1048.JPG', progress: 0.92, speed: '2.1 MB/s'),
      GuestUpload(name: 'IMG_1051.JPG', progress: 0.74, speed: '1.8 MB/s'),
      GuestUpload(name: 'IMG_1056.JPG', progress: 0.47, speed: '1.2 MB/s'),
    ];

    return _Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _PanelHeading(
            eyebrow: 'GUEST UPLOADS',
            title: 'Compression and upload queue',
          ),
          const SizedBox(height: 18),
          Text(
            '${room.uploadsLive} guests are uploading to this room right now.',
            style: TextStyle(color: Colors.white.withValues(alpha: 0.72)),
          ),
          const SizedBox(height: 18),
          for (final upload in uploads) ...[
            _UploadRow(upload: upload),
            if (upload != uploads.last) const SizedBox(height: 14),
          ],
        ],
      ),
    );
  }
}

class _GuestAlbumPanel extends StatelessWidget {
  const _GuestAlbumPanel({required this.room});

  final EventRoom room;

  @override
  Widget build(BuildContext context) {
    return _Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _PanelHeading(
            eyebrow: 'SHARED ALBUM',
            title: 'What the guest receives',
          ),
          const SizedBox(height: 18),
          Row(
            children: [
              Expanded(
                child: _MetricTile(label: 'Album', value: room.shareAlbumTitle),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _MetricTile(label: 'QR state', value: room.qrState),
              ),
            ],
          ),
          const SizedBox(height: 18),
          Text(
            'Guests scan the QR and open the final event album instead of browsing the full raw upload batch.',
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.72),
              height: 1.45,
            ),
          ),
          const SizedBox(height: 18),
          const _PreviewStrip(
            items: [
              _PreviewTile(
                title: 'Main-person album',
                subtitle: 'Curated by host',
              ),
              _PreviewTile(
                title: 'Best event moments',
                subtitle: 'Ready to view',
              ),
              _PreviewTile(
                title: 'Download selected',
                subtitle: 'Guest handoff',
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Panel extends StatelessWidget {
  const _Panel({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.045),
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: child,
    );
  }
}

class _PanelHeading extends StatelessWidget {
  const _PanelHeading({
    required this.eyebrow,
    required this.title,
    this.trailing,
  });

  final String eyebrow;
  final String title;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                eyebrow,
                style: Theme.of(context).textTheme.labelMedium?.copyWith(
                  color: const Color(0xFFFFB65C),
                  letterSpacing: 2.2,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                title,
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                  height: 1.08,
                ),
              ),
            ],
          ),
        ),
        if (trailing != null) ...[const SizedBox(width: 12), trailing!],
      ],
    );
  }
}

class _MetricTile extends StatelessWidget {
  const _MetricTile({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.04),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.66),
              fontSize: 12,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            value,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 15,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _ActionCard extends StatelessWidget {
  const _ActionCard({
    required this.title,
    required this.detail,
    required this.icon,
  });

  final String title;
  final String detail;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 220,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.04),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: const Color(0xFFFFB65C)),
          const SizedBox(height: 14),
          Text(
            title,
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w700,
              fontSize: 16,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            detail,
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.7),
              height: 1.45,
            ),
          ),
        ],
      ),
    );
  }
}

class _CodeCard extends StatelessWidget {
  const _CodeCard({
    required this.title,
    required this.code,
    required this.subtitle,
  });

  final String title;
  final String code;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        gradient: const LinearGradient(
          colors: [Color(0x26FFB65C), Color(0x14FFFFFF)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        border: Border.all(color: const Color(0x44FFB65C)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: TextStyle(color: Colors.white.withValues(alpha: 0.68)),
          ),
          const SizedBox(height: 10),
          Text(
            code,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 28,
              fontWeight: FontWeight.w800,
              letterSpacing: 4,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            subtitle,
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.72),
              height: 1.4,
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: const Color(0xFF173346),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: const TextStyle(
          color: Color(0xFF98F0DD),
          fontWeight: FontWeight.w700,
          fontSize: 12,
        ),
      ),
    );
  }
}

class _TopPill extends StatelessWidget {
  const _TopPill({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: Colors.white.withValues(alpha: 0.9),
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class _FlowStep extends StatelessWidget {
  const _FlowStep({
    required this.step,
    required this.title,
    required this.detail,
  });

  final String step;
  final String title;
  final String detail;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.035),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 34,
            height: 34,
            alignment: Alignment.center,
            decoration: const BoxDecoration(
              color: Color(0x1FFFb65c),
              shape: BoxShape.circle,
            ),
            child: Text(
              step,
              style: const TextStyle(
                color: Color(0xFFFFB65C),
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  detail,
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.7),
                    height: 1.45,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PreviewStrip extends StatelessWidget {
  const _PreviewStrip({required this.items});

  final List<_PreviewTile> items;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 110,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: items.length,
        separatorBuilder: (_, _) => const SizedBox(width: 12),
        itemBuilder: (context, index) => items[index],
      ),
    );
  }
}

class _PreviewTile extends StatelessWidget {
  const _PreviewTile({required this.title, required this.subtitle});

  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 170,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        gradient: const LinearGradient(
          colors: [Color(0x1A67D7F7), Color(0x14FFB65C)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Spacer(),
          Text(
            title,
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            subtitle,
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.7),
              height: 1.35,
            ),
          ),
        ],
      ),
    );
  }
}

class _UploadRow extends StatelessWidget {
  const _UploadRow({required this.upload});

  final GuestUpload upload;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                upload.name,
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            Text(
              upload.speed,
              style: TextStyle(color: Colors.white.withValues(alpha: 0.68)),
            ),
          ],
        ),
        const SizedBox(height: 10),
        ClipRRect(
          borderRadius: BorderRadius.circular(999),
          child: LinearProgressIndicator(
            value: upload.progress,
            minHeight: 10,
            backgroundColor: Colors.white.withValues(alpha: 0.08),
            valueColor: const AlwaysStoppedAnimation<Color>(Color(0xFF67D7F7)),
          ),
        ),
      ],
    );
  }
}

class EventRoom {
  const EventRoom({
    required this.title,
    required this.subtitle,
    required this.inviteCode,
    required this.qrState,
    required this.hostName,
    required this.photosCollected,
    required this.guestsJoined,
    required this.uploadsLive,
    required this.aiAlbumsReady,
    required this.mainPerson,
    required this.matchedMainPersonPhotos,
    required this.shareAlbumTitle,
  });

  final String title;
  final String subtitle;
  final String inviteCode;
  final String qrState;
  final String hostName;
  final int photosCollected;
  final int guestsJoined;
  final int uploadsLive;
  final int aiAlbumsReady;
  final String mainPerson;
  final int matchedMainPersonPhotos;
  final String shareAlbumTitle;
}

class GuestUpload {
  const GuestUpload({
    required this.name,
    required this.progress,
    required this.speed,
  });

  final String name;
  final double progress;
  final String speed;
}
