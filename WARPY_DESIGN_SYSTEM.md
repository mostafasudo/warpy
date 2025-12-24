# Warpy.ai: Brand & Product Strategy

> "Bend the Interface."

## 1. Branding Guidelines

**Brand Archetype: The Adaptive Architect** Warpy is a precision engine, not a chatty assistant. It combines the visionary capability of The Magician (generating UI from nothing) with the structural rigor of The Sage (analyzing deep data).

### Core Values & Tone

- **Fluidity:** The interface is liquid. It morphs to fit the data, rejecting static grids.

- **Invisibility:** Warpy is unobtrusive. It is a lens, not a wall. It waits for intent, then acts instantly.

- **Precision:** We speak the language of developers and analysts. No fluff. High signal-to-noise ratio.

**Voice:** Technical Co-Pilot.

- **Do:** Use active verbs ("Morph," "Generate," "Synthesize"). Speak in concise, data-driven statements.

- **Don't:** Use anthropomorphic language ("I think," "Here's a helper"). Avoid playful/cartoony slang.

### Visual Style Guide: "The Cherenkov Void" & "The Laboratory"

**Dark Mode (Primary):** "Deep Gunmetal." Avoid pure black. Use a "luminance staircase" of deep, slate-tinted greys to create depth without harsh borders.

**Light Mode (Secondary):** "The Laboratory." A sterile, high-exposure engineering environment. Signal white backgrounds with "Vapor Grey" surfaces and sharp, deep gunmetal text.

**Logo Usage:**

- **Primary:** White strokes on Deep Gunmetal.

- **Motion:** The strokes should drift slightly, like objects in zero gravity, never remaining perfectly static.

## 2. Catchy Brand Statements

### Primary Slogan:

> "Bend the Interface."

### Secondary Taglines:

- "Static is Dead. Go Fluid."

- "Your Dashboard, Unlocked."

- "From Read-Only to Real-Time."

- "npm install intelligence" (Developer focused)

## 3. Core Product Design Guidelines

### Design System Tokens

#### Palette: The Event Horizon System (Refined)

**Surfaces (Dark Mode - The Staircase):**

- `#090a0b` Deep Void (Main Background - L4%)

- `#121416` Gunmetal Surface (Cards - L8%)

- `#1b1e22` Active Layer (Inputs/Muted - L12%)

- `#23262b` Stealth Border (Borders - L16%)

**Accents & Semantics:**

- **Primary:** Interstellar Blue (HSL 215 100% 50%). A heavier, authoritative electric blue that anchors the UI.

- **Secondary:** Moon Rock (HSL 217 19% 27%). A subtle technical grey for tags and secondary actions. Do not use Violet here.

- **AI Glow:** Generative Violet (HSL 255 60% 65%). Reserved exclusively for AI-generated elements and magic moments. Never used for standard UI buttons.

#### Typography: The Unified Stack

- **Headlines & UI:** Inter. We have reverted to a single sans-serif to maintain a professional, "invisible" structural feel. Tight tracking (-0.025em) gives it a modern edge.

- **Code/Data:** JetBrains Mono. Used strictly for code blocks, JSON payloads, and technical values.

#### Border Radius

- **Pill (999px):** For the collapsed "Beacon" widget and primary buttons.

- **Standard (8px):** For cards, inputs, and detached windows.

### UI/UX Design Principles

#### 1. The Luminance Staircase

Never use high-contrast borders to separate layers in dark mode. Instead, use 4% increments in lightness (4% → 8% → 12%) to create a "staircase" of depth. This prevents the "Grid Prison" effect and reduces eye strain.

#### 2. Semantic Attention Economy

Color indicates function, not just brand.

- Blue = User Action (Save, Submit, Navigate).

- Violet = AI Action (Generate, Morph, Analyze).

- Grey = Meta Information (Tags, Secondary options).

#### 3. Polymorphic Interface (States of Matter)

- **Solid:** The collapsed "Beacon" (a small, glowing pill).

- **Liquid:** The expanded "Command Center" (flows over the content).

- **Gas:** Detached "Projections" (floating windows pinned to the dashboard).

#### 4. Skeleton Morphing

Never use spinning loaders. When a user requests a UI element, the widget immediately expands to the predicted size of the result and fills with a shimmering skeleton. This reduces perceived latency.

#### 5. The Spotlight Effect

When discussing specific data, Warpy dims the host dashboard (30% opacity) and highlights the specific DOM element (chart or table) with a Warp Cyan border, drawing a bezier curve connecting the chat to the data.
