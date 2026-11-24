# Label printers

Studio prints spool and product labels from the label card (`renderer/labels/`). Besides the
system print dialog and PDF / PNG / SVG, **Print** can go straight to a label printer, with no
dialog and no driver. The card's **Printer** list offers:

| Line | Route | Code |
|------|-------|------|
| System dialog | the operating system's print dialog | `main.js` `label:render` |
| Marklife P15 | Bluetooth LE, Marklife "L11" protocol | `renderer/labels/p15.js` |
| `<name> · network` | a Brother QL found on the network (mDNS), raw raster on TCP 9100 | `services/label-printers.js` |
| `<name> · installed` | a printer installed on the computer, printed silently through its driver; an installed Brother QL is printed like a network one, at the address behind its Windows port or the one typed in **Address** | `main.js` `label:printers` |

Picking a printer picks its template: **Marklife P15** (25 × 12 mm, a margin on its 12 × 30 mm labels) for the P15, **Brother 62 × 29**
for a Brother QL, or the template last printed on that printer. Templates the printer's roll cannot
take are greyed out.

## Brother QL (network)

- The search listens on every network interface of the computer (a VPN or Hyper-V adapter would
  otherwise hide the printer).
- **Roll**: Studio asks the printer which roll it holds (SNMP v1, `prtInputMediaName`) and fills
  the **Roll** list and the template with it. A QL-580N answers that question but no raster status
  request over the network. When the printer says nothing, pick the roll by hand: a job sent for the
  wrong roll puts the printer in error.
- **The printer is in error** (error light on, nothing prints): press its **Power** button once to
  clear the error, then print again. The card says so: it reads the printer's state over SNMP and
  shows "In error" or "Ready". On a QL-580N, `ESC @` on the raw port does not clear it, and a Printer MIB
  reset (`prtGeneralReset`) was not seen to restart it either.

## Brother QL over USB (QL-800 …)

A USB-only model (the QL-800 has no network; the QL-810W has Wi-Fi) prints once its Windows driver
is installed: it is listed as `<name> · installed` and printed silently through the driver. The
roll and the printer's state are not read on that route. Not yet done: sending it the same raw
raster as a network QL through the Windows queue in RAW mode (`WritePrinter`), which would give
die-cut labels their exact length; it needs a USB QL on the bench to be tested.

## Marklife P15 (Bluetooth)

- The computer needs a Bluetooth adapter with **Bluetooth Low Energy** enabled. On Windows, a CSR8510
  dongle (USB ID `0A12:0001`, such as the Sena UD100) may have Low Energy switched off by Windows: the
  System log then shows BTHUSB event 30 ("The local adapter does not support an important Low Energy
  controller state"). No driver changes that; use another adapter (Bluetooth 5, Realtek or Intel).
  Windows runs one Bluetooth adapter at a time (BTHUSB event 6): unplug the old one, then replug the
  new one.
- Close the Marklife phone app first: the printer takes one connection at a time.
- Click **Connect** in the card. The printers seen are listed; one whose name is not a Marklife one
  can be picked by hand.

## Adding a printer

Each printer family plugs in at a handful of places; nothing else in the card needs to change.

| To add | Where |
|--------|-------|
| Another Brother QL model | the QL path already takes any model announced as `QL-…`: check its head width in `qlHeadDots` (1296 dots for the QL-10xx) and its rolls in `QL_MEDIA` (`services/label-printers.js`), and the card's roll list `QL_ROLLS` (`renderer/labels/index.js`) |
| A network printer that does not announce itself | it can be reached by address: the **Address** field of an installed Brother QL, or its Windows port (`_printerHosts` in `main.js`) |
| Another Marklife / L11 Bluetooth printer (P7, P15S, LP15…) | add its advertised name to `BT_PRINTER` (`main.js`, `createWindow`); the widest label side it takes is `P15_MAX_MM` (`renderer/labels/p15.js`), its template a `LABEL_TEMPLATES` + `LAYOUTS` entry |
| A new protocol (another brand) | a module beside `p15.js` / `printQl` that turns the label bitmap (`label:bitmap`, 1 bit, MSB first) into that printer's job; a `kind` in `printerFor` / `printerOptions`; a branch in `printDirect`; a `fitsPrinter` rule for its roll; and a default template in `fittingTemplate` |
| A new label size | a `LABEL_TEMPLATES` entry, its `LAYOUTS` block (tenths of a millimetre) and a `labelTpl_<id>` key in all 11 locales |
