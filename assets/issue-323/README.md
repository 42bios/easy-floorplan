# Issue #323: furniture surfaces and action icons

Run `npx vite --host 127.0.0.1 --port 4323` and open
`http://127.0.0.1:4323/docker/furniture-click-preview.html`.

The fixture has decorative furniture, a tap action, a hold-only action and stairs
that change floor, in both 2D and 3D. Tap a furniture surface outside its icon to
focus the room. Click the tap icon, hold the hold icon, and use the stairs icons
to go upstairs and back. The counters distinguish room focus from action dispatch.
Reset restores both views; the rotation control covers all four orientations.
The large demonstration room has an explicit 1.3x zoom so room focus stays visible.

## Current comparison

These are actual browser screenshots after clicking the same actionable table
surface, outside the icon, in both views:

- `actions-before.png`: PR #332's previous head, `c02988865274d627757da40dbeac1abe3e0cd8f7`, with only the updated preview fixture copied in. Both surface clicks execute the furniture action; neither room focuses. There is no visible action icon.
- `actions-after.png`: this revision. Both rooms focus, neither action runs, and the visible icons remain available for their own gestures.

The `?stage=before` query changes only the caption. Before captures must run the
previous source revision; changing the query on the current code does not undo
the implementation.

The preview supplies a small `ha-icon` stand-in using the same MDI paths that HA
renders. Paths come from [Templarian/MaterialDesign](https://github.com/Templarian/MaterialDesign/tree/master/svg);
its license is included as [mdi-LICENSE](mdi-LICENSE). No Home Assistant instance
or external service is contacted by the fixture.

## Original decorative-furniture comparison

`before.png` and `after.png` retain the initial PR's screenshots, using the older
preview fixture from `c02988865274d627757da40dbeac1abe3e0cd8f7`:

- `before.png`: upstream `ea5b5d2c4835f0679f362f4472651064ed682fba`, with only that preview copied in. Clicking either decorative table fails to focus its room.
- `after.png`: the initial PR. Both rooms focus after tapping their decorative table.
