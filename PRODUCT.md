# TEP (Transactions Enrichment Program) Design Context

## Design Context

### Users
**Primary audience**: Operations staff (bank tellers, branch managers, administrative personnel)
- **Mental state when logging in**: Confident, task-focused
- **2FA experience**: Completely new—no prior knowledge of authenticator apps or TOTP flows
- **Primary goal**: Access the system quickly with clarity on what's happening
- **Pain point**: Unknown security features shouldn't feel like barriers, but like helpful safeguards

### Brand Personality
**TEP Personality**: Professional + Friendly/Approachable
- **Tone**: Professional (trustworthy, reliable) but never cold or corporate-speak
- **Voice**: Clear, jargon-free, human-centered
- **Emotional goal**: Users should feel guided, not lost. Confident, not confused.

### Aesthetic Direction
**Visual Direction**: Google-inspired login flow
- Keep existing design system: Rubik font, cyan (#12bdce) brand color, light/dark themes, particles background
- **Focus**: Clear visual hierarchy through divs/containers and improved text/copy
- **Key principle**: Every element serves explanation—no decorative noise
- **Accessibility first**: Text must be scannable, colors must be clear, steps must feel obvious

### Design Principles for 2FA LoginPage
1. **Progressive Disclosure** — Show only what the user needs RIGHT NOW. One question at a time, no cognitive overload.
2. **Hand-holding + Speed** — Guide the user through each step with a clear explanation of what's happening next. Minimize steps but maximize clarity.
3. **Clear Visual Hierarchy** — Use containers, whitespace, and typography to make the flow scannable. Each step is distinct but part of one coherent journey.
4. **Plain Language** — "Authenticator app" not "TOTP." "Security code" not "verification code." Explain concepts inline, not in tooltips.
5. **Reassurance** — Non-technical users need to feel secure. Use copy and visual design to build confidence, not anxiety.
