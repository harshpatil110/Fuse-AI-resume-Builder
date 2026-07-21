# Fuse: UI/UX Design System & Mandate
**Aesthetic:** Warm Editorial Minimalism
**Core Philosophy:** A fusion of Japanese spatial restraint, soft brutalism's structural confidence, and the typographic authority of high-end editorial publishing. The interface must feel like a premium, considered brand.

---

## 🚫 ABSOLUTE VISUAL PROHIBITIONS (THE "NEVER" LIST)
Violating any of these breaks the entire design system. Do not merge PRs that include:
* **NO Dark Mode:** The canvas is always warm and light. There is no toggle.
* **NO Neon or Saturated Colors:** No electric blues, no pure greens.
* **NO "AI" Palettes:** Absolutely no purple, magenta, or glowing gradients. 
* **NO Glassmorphism:** No frosted glass or `backdrop-filter: blur()` decorative panels.
* **NO Deep Drop Shadows:** No `shadow-xl`, `shadow-2xl`, or colored glows.
* **NO Pill Buttons:** No `rounded-full` on primary action elements.
* **NO SaaS Dashboard Tropes:** No dark nav rails, no glowing KPI cards.
* **NO Heavy Border-Radius:** Cards are not bubbles; keep structural components crisp.
* **NO Emoji-Heavy UI:** Icons must be crisp SVG line icons or strict text.

---

## 🎨 CORE COLOR SYSTEM

### 1. Background (The Canvas)
The application background MUST be a warm, light beige. It should feel like high-quality uncoated paper.
* **Primary Canvas:** `#F7F5F0` (Tailwind: `bg-[#F7F5F0]` or `bg-stone-50`)
* **Alternate Canvas (Panels):** `#F2F0EA` (Slightly warmer, stone-like)

### 2. Accent Color (Primary Actions)
Used sparingly (1-2 times per screen max). It should feel like a clear sky at noon.
* **Primary Accent:** `#BFDBFE` (Tailwind: `blue-200`) — subtle fills, drop zones.
* **Action Accent:** `#93C5FD` (Tailwind: `blue-300`) — button borders, highlights.
* **Text on Accent:** `#1E40AF` (Tailwind: `blue-800`) — readability on light blue.
* **Focused Accent:** `#60A5FA` (Tailwind: `blue-400`) — focus rings only.

### 3. Typography Colors
* **Primary (Headings):** `#1C1917` (Tailwind: `text-stone-900`)
* **Secondary (Body/Meta):** `#78716C` (Tailwind: `text-stone-500`)
* **Disabled/Hint:** `#A8A29E` (Tailwind: `text-stone-400`)

### 4. Borders & Surfaces
* **Default Border:** `#E7E5E4` (Tailwind: `border-stone-200`)
* **Card Surface:** `#FFFFFF` (Pure white, sits atop the beige canvas)
* **Elevated Surface:** `#FAFAF9` (Tailwind: `bg-stone-50`)

---

## ✍️ TYPOGRAPHY SYSTEM
Typography does the heavy lifting in this UI. Contrast in weight and size is critical.

### Font Stacks
* **Headings:** `'Inter', 'DM Sans', 'Geist', system-ui, sans-serif`
* **Body Text:** `'Inter', 'DM Sans', system-ui, sans-serif`
* **Accent (One per screen max):** `'Playfair Display', 'DM Serif Display', serif`
* **Code/Tags:** `'JetBrains Mono', 'Fira Code', monospace`

### Scale & Weight Strict Rules
* **Hero/Display:** `text-5xl` to `text-7xl` | `font-black` (800-900) | `tracking-tight` (-0.03em)
* **Section Heading:** `text-3xl` | `font-bold` (700) | `tracking-tight` (-0.02em)
* **Component Title:** `text-lg` | `font-semibold` (600) | `tracking-tight` (-0.01em)
* **UI Label:** `text-xs` | `font-medium` (500) | `tracking-widest` | `uppercase`
* **Body:** `text-base` | `font-normal` (400) | `leading-relaxed` (1.7)

*Rule: Never center body text. Cap line length at `max-w-[65ch]` for readability.*

---

## 🧱 COMPONENT ARCHITECTURE

### Buttons
* **Primary (Generate/Save):** `bg-stone-900 text-white rounded-sm px-6 py-2.5 text-sm font-medium tracking-wide hover:bg-stone-700`
* **Secondary (Edit/Cancel):** `bg-transparent border border-stone-300 text-stone-800 rounded-sm hover:bg-stone-100`
* **Accent (Connect GitHub):** `bg-blue-100 border border-blue-200 text-blue-800 rounded-sm hover:bg-blue-200`

### Inputs & Forms
* **Styling:** `bg-white border border-stone-300 rounded-sm px-4 py-2.5 text-sm placeholder:text-stone-400`
* **Focus State:** `focus:outline-none focus:ring-1 focus:ring-blue-300 focus:border-blue-300`
* **Labels:** `text-xs font-medium tracking-wider uppercase text-stone-500 mb-1.5 block`

### Upload / Drop Zones (JD & Resume)
* **Default:** `bg-transparent border-2 border-dashed border-stone-300 rounded-lg p-8`
* **Hover/Active:** `hover:border-blue-300 hover:bg-blue-50 transition-colors duration-200`

### Cards (GitHub Repos & Resume Previews)
* **Styling:** `bg-white border border-stone-200 shadow-sm rounded-lg p-6`

### AI Feedback Bubbles (The Critic)
* **AI Note:** `bg-white border border-stone-200 text-stone-700 rounded-lg p-4 text-sm`
* **Highlight:** Wrap specific resume critique targets in a subtle `bg-blue-50 border-b border-blue-200`.

---

## 📐 LAYOUT, SPACING & MOTION

* **Whitespace:** Whitespace IS design. Default to an 8px grid. When in doubt, add more padding (`py-16` to `py-24` for sections). The beige canvas must be generously visible.
* **Alignment:** Default to left-aligned. Asymmetric layouts are preferred over perfectly symmetrical, rigid grids.
* **Loading States:** No sci-fi animations. Use a simple, thin circular border spinner (`border-stone-300` with `border-t-stone-700`) or a soft pulsing dot in `bg-blue-200`.
* **Motion:** `transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]`. No springy physics or dramatic overshoot.

---

## 📝 COPY & CONTENT VOICE
* **Tone:** Confident, editorial, noun-led, and calm. 
* **Headings:** "Align your experience." (NOT "Let's build a magical resume!")
* **CTAs:** Direct verbs: "Upload", "Generate", "Connect" (NOT "Let's go!" or "Start the magic!")
* **Empty States:** Minimal and instructional. "No job description provided. Upload a JD to begin alignment."