// Initialize Lucide Icons
lucide.createIcons();

/* ==========================================================================
   1. Canvas Antigravity Particle Simulation
   ========================================================================== */
const canvas = document.getElementById('gravityCanvas');
const ctx = canvas.getContext('2d');

let width = window.innerWidth;
let height = window.innerHeight;

canvas.width = width;
canvas.height = height;

// Simulation variables
const nodes = [];
const nodeCount = Math.min(18, Math.floor((width * height) / 70000) + 4);
const connectionDistance = 180;
const repulsionRadius = 160;
const repulsionStrength = 0.8;
const friction = 0.95;

const nodeLabels = [
  { text: "₦180k income", type: "ledger" },
  { text: "₦35k materials", type: "ledger" },
  { text: "Plumber available", type: "gig" },
  { text: "Need plumber", type: "gig" },
  { text: "2-bed Lekki", type: "housing" },
  { text: "Rent: ₦800k", type: "housing" },
  { text: "invoice client", type: "reminder" },
  { text: "May 23, 9:00 AM", type: "reminder" },
  { text: "receipt_83.jpg", type: "media" },
  { text: "weekly_report.pdf", type: "media" },
  { text: "₦150k laptop", type: "marketplace" },
  { text: "Surulere clinic", type: "gig" }
];

// Track Mouse Movement
let mouse = { x: null, y: null, active: false };

window.addEventListener('mousemove', (e) => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
  mouse.active = true;
});

window.addEventListener('mouseleave', () => {
  mouse.x = null;
  mouse.y = null;
  mouse.active = false;
});

window.addEventListener('resize', () => {
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width;
  canvas.height = height;
});

// Node Class Definition
class GravityNode {
  constructor(text, type) {
    this.text = text;
    this.type = type;
    this.padding = { x: 14, y: 8 };
    ctx.font = "12px JetBrains Mono";
    const textMetrics = ctx.measureText(this.text);
    
    this.width = textMetrics.width + (this.padding.x * 2) + 12; // Extra room for dot
    this.height = 32;
    
    // Spawn inside viewport boundaries
    this.x = Math.random() * (width - this.width - 40) + 20;
    this.y = Math.random() * (height - this.height - 40) + 20;
    
    // Low floating speeds
    this.vx = (Math.random() - 0.5) * 0.4;
    this.vy = (Math.random() - 0.5) * 0.4;
    
    // Secondary velocities (forces applied by mouse)
    this.fx = 0;
    this.fy = 0;
  }

  update() {
    // Mouse Repulsion Force (Antigravity effect)
    if (mouse.active) {
      const centerX = this.x + this.width / 2;
      const centerY = this.y + this.height / 2;
      
      const dx = centerX - mouse.x;
      const dy = centerY - mouse.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < repulsionRadius) {
        // Force calculation - stronger when closer
        const force = (repulsionRadius - dist) / repulsionRadius * repulsionStrength;
        // Vector direction
        const angle = Math.atan2(dy, dx);
        this.fx += Math.cos(angle) * force;
        this.fy += Math.sin(angle) * force;
      }
    }

    // Apply forces & float velocities
    this.vx += this.fx;
    this.vy += this.fy;
    
    // Apply friction to mouse forces so they settle back to float speed
    this.fx *= friction;
    this.fy *= friction;
    
    // Clamp velocities to prevent nodes flying away
    const maxVelocity = 4;
    this.vx = Math.max(Math.min(this.vx, maxVelocity), -maxVelocity);
    this.vy = Math.max(Math.min(this.vy, maxVelocity), -maxVelocity);

    // Apply movement
    this.x += this.vx;
    this.y += this.vy;

    // Bounce off screen limits
    if (this.x < 0) { this.x = 0; this.vx *= -1; }
    if (this.x + this.width > width) { this.x = width - this.width; this.vx *= -1; }
    if (this.y < 0) { this.y = 0; this.vy *= -1; }
    if (this.y + this.height > height) { this.y = height - this.height; this.vy *= -1; }
  }

  draw() {
    ctx.save();
    
    // Draw box outline (light gray, black border)
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.strokeStyle = "#0f0f11";
    ctx.lineWidth = 1;
    
    // Draw rounded border outline box
    ctx.beginPath();
    ctx.roundRect(this.x, this.y, this.width, this.height, 4);
    ctx.fill();
    ctx.stroke();

    // Draw Type status dot
    let dotColor = "#2563eb"; // default blue
    if (this.type === "ledger") dotColor = "#16a34a"; // green
    if (this.type === "housing") dotColor = "#d97706"; // amber
    if (this.type === "reminder") dotColor = "#dc2626"; // red
    if (this.type === "media") dotColor = "#71717a"; // dark gray
    
    ctx.fillStyle = dotColor;
    ctx.beginPath();
    ctx.arc(this.x + 14, this.y + this.height / 2, 4, 0, Math.PI * 2);
    ctx.fill();

    // Draw Text label
    ctx.fillStyle = "#0f0f11";
    ctx.font = "11px JetBrains Mono";
    ctx.textBaseline = "middle";
    ctx.fillText(this.text, this.x + 24, this.y + this.height / 2);
    
    ctx.restore();
  }
}

// Instantiate particles
for (let i = 0; i < nodeCount; i++) {
  const meta = nodeLabels[i % nodeLabels.length];
  nodes.push(new GravityNode(meta.text, meta.type));
}

// Connect floating nodes with lines
function drawConnections() {
  ctx.save();
  ctx.lineWidth = 0.5;
  
  for (let i = 0; i < nodes.length; i++) {
    const nodeA = nodes[i];
    const centerAX = nodeA.x + nodeA.width / 2;
    const centerAY = nodeA.y + nodeA.height / 2;
    
    for (let j = i + 1; j < nodes.length; j++) {
      const nodeB = nodes[j];
      const centerBX = nodeB.x + nodeB.width / 2;
      const centerBY = nodeB.y + nodeB.height / 2;
      
      const dx = centerAX - centerBX;
      const dy = centerAY - centerBY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < connectionDistance) {
        // Opacity proportional to proximity (fully visible close up, fades at edge)
        const alpha = (connectionDistance - dist) / connectionDistance * 0.15;
        ctx.strokeStyle = `rgba(15, 15, 17, ${alpha})`;
        ctx.beginPath();
        ctx.moveTo(centerAX, centerAY);
        ctx.lineTo(centerBX, centerBY);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

// Animation loop
function animate() {
  ctx.clearRect(0, 0, width, height);
  
  drawConnections();
  
  nodes.forEach(node => {
    node.update();
    node.draw();
  });
  
  requestAnimationFrame(animate);
}

// Start simulation
animate();


/* ==========================================================================
   2. Interactive Mockups / Database & Chat Engine
   ========================================================================== */

const chatBody = document.getElementById('chatBody');
const chatInput = document.getElementById('chatInput');
const dbRecordCount = document.getElementById('dbRecordCount');
const jsonDisplay = document.getElementById('jsonDisplay');

// Tab elements
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// Ledger state display elements
const ledgerIncome = document.getElementById('ledgerIncome');
const ledgerExpenses = document.getElementById('ledgerExpenses');
const ledgerNet = document.getElementById('ledgerNet');
const ledgerRows = document.getElementById('ledgerRows');

// Database Collections Simulation
let memories = [];
let databaseStats = {
  income: 0,
  expenses: 0,
  net: 0,
  ledgerRecords: []
};

// Preset Conversation Scripts
const presets = {
  bookkeeping: [
    {
      sender: "user",
      text: "Just made ₦180k from a curtain job. Materials were ₦35k."
    },
    {
      sender: "bot",
      text: "I've logged that. Income of ₦180,000.00 (curtain job) and Expense of ₦35,000.00 (materials). Your net balance is ₦145,000.00.",
      dbUpdate: () => {
        const id1 = `mem_${Math.random().toString(36).substr(2, 9)}`;
        const id2 = `mem_${Math.random().toString(36).substr(2, 9)}`;
        const now = new Date().toISOString();
        
        const record1 = {
          _id: id1,
          userId: "user_chidi_92",
          type: "ledger",
          amount: 180000,
          currency: "NGN",
          date: now,
          metadata: {
            transactionType: "income",
            vendor: "Client",
            description: "curtain job"
          }
        };

        const record2 = {
          _id: id2,
          userId: "user_chidi_92",
          type: "ledger",
          amount: 35000,
          currency: "NGN",
          date: now,
          metadata: {
            transactionType: "expense",
            vendor: "Supplier",
            description: "materials"
          }
        };
        
        memories.unshift(record1, record2);
        databaseStats.income += 180000;
        databaseStats.expenses += 35000;
        databaseStats.net = databaseStats.income - databaseStats.expenses;
        
        databaseStats.ledgerRecords.unshift(
          { date: now.split('T')[0], type: "income", category: "curtain job", amount: 180000 },
          { date: now.split('T')[0], type: "expense", category: "materials", amount: 35000 }
        );
      }
    }
  ],
  gigs: [
    {
      sender: "user",
      text: "I need a plumber in Ikeja"
    },
    {
      sender: "bot",
      text: "Searching active gigs... No active plumbers in Ikeja found. I've logged your request as a standing NEED. I will notify you when a match is posted.",
      dbUpdate: () => {
        const id = `post_${Math.random().toString(36).substr(2, 9)}`;
        const now = new Date().toISOString();
        const post = {
          _id: id,
          userId: "user_chidi_92",
          type: "post",
          intent: "need",
          category: "home_services",
          neighborhood: "Ikeja",
          status: "active",
          createdAt: now,
          metadata: {
            subcategory: "plumber",
            title: "Plumber needed for kitchen pipe leak"
          }
        };
        memories.unshift(post);
      }
    },
    {
      sender: "user",
      text: "I'm a plumber available weekdays in Ikeja"
    },
    {
      sender: "bot",
      text: "I've posted your plumbing OFFER! MATCH FOUND! Connecting you with user_chidi_92 who needs a plumber in Ikeja. (Connecting numbers: +234... / @Chidi_92)",
      dbUpdate: () => {
        const id = `post_${Math.random().toString(36).substr(2, 9)}`;
        const now = new Date().toISOString();
        const offer = {
          _id: id,
          userId: "user_kunle_44",
          type: "post",
          intent: "offer",
          category: "home_services",
          neighborhood: "Ikeja",
          status: "active",
          createdAt: now,
          metadata: {
            subcategory: "plumber",
            title: "Plumbing services - weekdays available",
            availability: "weekdays"
          }
        };
        memories.unshift(offer);
        
        // Mark match
        const matchingNeed = memories.find(m => m.type === 'post' && m.intent === 'need' && m.neighborhood === 'Ikeja' && m.metadata.subcategory === 'plumber');
        if (matchingNeed) {
          matchingNeed.status = 'fulfilled';
          matchingNeed.metadata.fulfilledWith = id;
          offer.status = 'fulfilled';
          offer.metadata.fulfilledWith = matchingNeed._id;
        }
      }
    }
  ],
  housing: [
    {
      sender: "user",
      text: "📎 [Sent: flat_front.png]\n2-bedroom available, ₦800k/year, Lekki"
    },
    {
      sender: "bot",
      text: "Image uploaded: stored as media_file_id: m_file_38a291. Created new housing OFFER in Lekki for ₦800,000.00/year. Alerting matching seekers now.",
      dbUpdate: () => {
        const fileId = `m_file_${Math.random().toString(36).substr(2, 9)}`;
        const postId = `post_${Math.random().toString(36).substr(2, 9)}`;
        const now = new Date().toISOString();
        
        const post = {
          _id: postId,
          userId: "user_chidi_92",
          type: "post",
          intent: "offer",
          category: "housing",
          amount: 800000,
          neighborhood: "Lekki",
          status: "active",
          mediaFileIds: [fileId],
          createdAt: now,
          metadata: {
            title: "2-bedroom apartment",
            rentType: "yearly",
            bedrooms: 2
          }
        };
        memories.unshift(post);
      }
    }
  ],
  reminders: [
    {
      sender: "user",
      text: "Remind me to invoice the client tomorrow at 9am"
    },
    {
      sender: "bot",
      text: "Done! Reminder scheduled. I will send you a message on Telegram/WhatsApp tomorrow at 9:00 AM: 'Invoice the client'.",
      dbUpdate: () => {
        const id = `rem_${Math.random().toString(36).substr(2, 9)}`;
        const triggerDate = new Date();
        triggerDate.setDate(triggerDate.getDate() + 1);
        triggerDate.setHours(9, 0, 0, 0);
        
        const reminder = {
          _id: id,
          userId: "user_chidi_92",
          type: "reminder",
          message: "Invoice the client",
          triggerAt: triggerDate.toISOString(),
          delivered: false,
          createdAt: new Date().toISOString()
        };
        memories.unshift(reminder);
      }
    }
  ]
};

// State variables for current running preset
let activePreset = "bookkeeping";
let currentStep = 0;
let isTyping = false;

// Handle Preset Tabs
document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const targetPreset = btn.getAttribute('data-preset');
    
    // Switch active state
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    // Clear chat and reset steps
    chatBody.innerHTML = "";
    activePreset = targetPreset;
    currentStep = 0;
    isTyping = false;
    
    // Start script
    runPresetStep();
  });
});

// Run individual step in conversation preset
function runPresetStep() {
  const script = presets[activePreset];
  if (currentStep >= script.length) return;
  
  const step = script[currentStep];
  
  if (step.sender === "user") {
    // Show user message instantly
    appendMessage(step.text, "user");
    chatInput.value = step.text;
    currentStep++;
    
    // Schedule bot reply
    setTimeout(runPresetStep, 1000);
  } else if (step.sender === "bot") {
    // Show typing indicator
    showTypingIndicator();
    
    setTimeout(() => {
      removeTypingIndicator();
      appendMessage(step.text, "bot");
      
      // Execute database modifications
      if (step.dbUpdate) {
        step.dbUpdate();
        updateDatabaseUI();
      }
      
      currentStep++;
      chatInput.value = "";
      
      // Schedule next step if it's user message (simulated response)
      if (currentStep < script.length && script[currentStep].sender === "user") {
        setTimeout(runPresetStep, 1800);
      }
    }, 1200);
  }
}

// Append Chat Message
function appendMessage(text, sender) {
  const bubble = document.createElement('div');
  bubble.classList.add('chat-bubble');
  bubble.classList.add(sender === "user" ? "bubble-user" : "bubble-bot");
  // Replace newlines with breaks
  bubble.innerHTML = text.replace(/\n/g, '<br>');
  
  chatBody.appendChild(bubble);
  chatBody.scrollTop = chatBody.scrollHeight;
}

// Typing Indicator Helpers
function showTypingIndicator() {
  if (isTyping) return;
  isTyping = true;
  
  const indicator = document.createElement('div');
  indicator.classList.add('typing-indicator');
  indicator.id = 'typingIndicator';
  
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement('span');
    dot.classList.add('typing-dot');
    indicator.appendChild(dot);
  }
  
  chatBody.appendChild(indicator);
  chatBody.scrollTop = chatBody.scrollHeight;
}

function removeTypingIndicator() {
  const indicator = document.getElementById('typingIndicator');
  if (indicator) {
    indicator.remove();
    isTyping = false;
  }
}

// Update the database visualization displays
function updateDatabaseUI() {
  dbRecordCount.textContent = memories.length;
  
  // 1. Update JSON tab
  if (memories.length === 0) {
    jsonDisplay.textContent = "// Database is empty. Select a preset query above.";
  } else {
    jsonDisplay.textContent = JSON.stringify(memories, null, 2);
  }
  
  // 2. Update Ledger Aggregation statistics
  ledgerIncome.textContent = `₦${databaseStats.income.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  ledgerExpenses.textContent = `₦${databaseStats.expenses.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  ledgerNet.textContent = `₦${databaseStats.net.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  
  // Format ledger text coloring
  if (databaseStats.net > 0) {
    ledgerNet.className = "val text-success";
  } else if (databaseStats.net < 0) {
    ledgerNet.className = "val text-error";
  } else {
    ledgerNet.className = "val";
  }
  
  // Render ledger table rows
  if (databaseStats.ledgerRecords.length === 0) {
    ledgerRows.innerHTML = `<tr><td colspan="4" class="text-center text-muted">No transactions logged in this session</td></tr>`;
  } else {
    ledgerRows.innerHTML = databaseStats.ledgerRecords.map(row => `
      <tr>
        <td>${row.date}</td>
        <td>
          <span class="status-dot" style="background-color: ${row.type === 'income' ? '#16a34a' : '#dc2626'}"></span>
          <span style="font-family: var(--font-mono); text-transform: uppercase; font-size: 11px;">${row.type}</span>
        </td>
        <td>${row.category}</td>
        <td class="${row.type === 'income' ? 'text-success' : 'text-error'}" style="font-family: var(--font-mono); font-weight: 700;">
          ${row.type === 'income' ? '+' : '-'}₦${row.amount.toLocaleString()}
        </td>
      </tr>
    `).join('');
  }
}

// Database Panel Tabs Switching
tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const tabName = btn.getAttribute('data-tab');
    
    // Toggle active classes on buttons
    tabBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    // Toggle active content divs
    tabContents.forEach(content => {
      content.classList.remove('active');
      if (content.id === `tab${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`) {
        content.classList.add('active');
      }
    });
  });
});


/* ==========================================================================
   3. Navigation Handlers (Drawer Menu & Responsiveness)
   ========================================================================== */
const mobileNavToggle = document.querySelector('.mobile-nav-toggle');
const mobileDrawer = document.getElementById('mobileDrawer');
const drawerClose = document.getElementById('drawerClose');

mobileNavToggle.addEventListener('click', () => {
  mobileDrawer.classList.add('open');
});

drawerClose.addEventListener('click', () => {
  mobileDrawer.classList.remove('open');
});

// Close drawer when clicking a link
document.querySelectorAll('.drawer-links a').forEach(link => {
  link.addEventListener('click', () => {
    mobileDrawer.classList.remove('open');
  });
});


// Auto start initial script on load
window.addEventListener('DOMContentLoaded', () => {
  updateDatabaseUI();
  runPresetStep();
});
