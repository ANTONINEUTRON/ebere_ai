// Initialize Lucide Icons
lucide.createIcons();

/* ==========================================================================
   1. Hero Chat Preview Animation
   ========================================================================== */
const heroChatBody = document.getElementById('heroChat');

const heroConversation = [
  { sender: 'user', text: 'Just made ₦180k from a curtain job. Materials were ₦35k.', delay: 800 },
  { sender: 'typing', delay: 1200 },
  { sender: 'bot', text: 'Logged! Income: ₦180,000 (curtain job). Expense: ₦35,000 (materials). Net balance: ₦145,000. 📊', delay: 2200 },
  { sender: 'user', text: 'Find me a plumber in Ikeja', delay: 2000 },
  { sender: 'typing', delay: 1000 },
  { sender: 'bot', text: 'Found 2 plumbers near Ikeja! Connecting you with Kunle — available weekdays. 🔗', delay: 1800 },
  { sender: 'user', text: 'Remind me to invoice the client at 9am tomorrow', delay: 2200 },
  { sender: 'typing', delay: 900 },
  { sender: 'bot', text: 'Done! I\'ll remind you tomorrow at 9:00 AM: "Invoice the client" ⏰', delay: 1600 },
];

let heroAnimRunning = false;

function createHeroBubble(sender, text) {
  const bubble = document.createElement('div');
  bubble.classList.add('preview-bubble');
  bubble.classList.add(sender === 'user' ? 'preview-bubble-user' : 'preview-bubble-bot');
  bubble.textContent = text;
  return bubble;
}

function createHeroTyping() {
  const indicator = document.createElement('div');
  indicator.classList.add('preview-typing');
  indicator.id = 'heroTypingIndicator';
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement('span');
    dot.classList.add('preview-typing-dot');
    indicator.appendChild(dot);
  }
  return indicator;
}

function removeHeroTyping() {
  const el = document.getElementById('heroTypingIndicator');
  if (el) el.remove();
}

async function runHeroAnimation() {
  if (heroAnimRunning) return;
  heroAnimRunning = true;

  while (true) {
    // Clear previous messages
    if (heroChatBody) heroChatBody.innerHTML = '';

    for (const step of heroConversation) {
      await new Promise(resolve => setTimeout(resolve, step.delay));

      if (!heroChatBody) return;

      if (step.sender === 'typing') {
        heroChatBody.appendChild(createHeroTyping());
        heroChatBody.scrollTop = heroChatBody.scrollHeight;
      } else {
        removeHeroTyping();
        heroChatBody.appendChild(createHeroBubble(step.sender, step.text));
        heroChatBody.scrollTop = heroChatBody.scrollHeight;
      }
    }

    // Pause before looping
    await new Promise(resolve => setTimeout(resolve, 4000));
  }
}

// Start hero animation
runHeroAnimation();


/* ==========================================================================
   2. Scroll Reveal Animations (IntersectionObserver)
   ========================================================================== */
const revealElements = document.querySelectorAll('.reveal');

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, {
  threshold: 0.1,
  rootMargin: '0px 0px -40px 0px'
});

revealElements.forEach(el => revealObserver.observe(el));


/* ==========================================================================
   3. Interactive Simulator (Chat + Database Engine)
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

// State variables
let activePreset = "bookkeeping";
let currentStep = 0;
let isTyping = false;

// Handle Preset Tabs
document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetPreset = btn.getAttribute('data-preset');
    
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    // Clear chat and reset
    chatBody.innerHTML = "";
    activePreset = targetPreset;
    currentStep = 0;
    isTyping = false;
    
    runPresetStep();
  });
});

// Run individual step in conversation preset
function runPresetStep() {
  const script = presets[activePreset];
  if (currentStep >= script.length) return;
  
  const step = script[currentStep];
  
  if (step.sender === "user") {
    appendMessage(step.text, "user");
    chatInput.value = step.text;
    currentStep++;
    setTimeout(runPresetStep, 1000);
  } else if (step.sender === "bot") {
    showTypingIndicator();
    
    setTimeout(() => {
      removeTypingIndicator();
      appendMessage(step.text, "bot");
      
      if (step.dbUpdate) {
        step.dbUpdate();
        updateDatabaseUI();
      }
      
      currentStep++;
      chatInput.value = "";
      
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
  bubble.innerHTML = text.replace(/\n/g, '<br>');
  chatBody.appendChild(bubble);
  chatBody.scrollTop = chatBody.scrollHeight;
}

// Typing Indicator
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

// Update database UI displays
function updateDatabaseUI() {
  dbRecordCount.textContent = memories.length;
  
  if (memories.length === 0) {
    jsonDisplay.textContent = "// Select a preset above to see database records.";
  } else {
    jsonDisplay.textContent = JSON.stringify(memories, null, 2);
  }
  
  ledgerIncome.textContent = `₦${databaseStats.income.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  ledgerExpenses.textContent = `₦${databaseStats.expenses.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  ledgerNet.textContent = `₦${databaseStats.net.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  
  if (databaseStats.net > 0) {
    ledgerNet.className = "val text-success";
  } else if (databaseStats.net < 0) {
    ledgerNet.className = "val text-error";
  } else {
    ledgerNet.className = "val";
  }
  
  if (databaseStats.ledgerRecords.length === 0) {
    ledgerRows.innerHTML = `<tr><td colspan="4" class="text-center text-muted">No transactions logged</td></tr>`;
  } else {
    ledgerRows.innerHTML = databaseStats.ledgerRecords.map(row => `
      <tr>
        <td>${row.date}</td>
        <td>
          <span class="status-dot" style="background-color: ${row.type === 'income' ? 'var(--color-success)' : 'var(--color-error)'}; display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-right: 6px;"></span>
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

// Database Panel Tab Switching
tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const tabName = btn.getAttribute('data-tab');
    
    tabBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    tabContents.forEach(content => {
      content.classList.remove('active');
      if (content.id === `tab${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`) {
        content.classList.add('active');
      }
    });
  });
});


/* ==========================================================================
   4. Navigation Handlers
   ========================================================================== */
const mobileNavToggle = document.getElementById('mobileNavToggle');
const mobileDrawer = document.getElementById('mobileDrawer');
const drawerClose = document.getElementById('drawerClose');
const drawerOverlay = document.getElementById('drawerOverlay');

function openDrawer() {
  mobileDrawer.classList.add('open');
  drawerOverlay.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeDrawer() {
  mobileDrawer.classList.remove('open');
  drawerOverlay.classList.remove('active');
  document.body.style.overflow = '';
}

mobileNavToggle.addEventListener('click', openDrawer);
drawerClose.addEventListener('click', closeDrawer);
drawerOverlay.addEventListener('click', closeDrawer);

// Close drawer when clicking a link
document.querySelectorAll('.drawer-links a').forEach(link => {
  link.addEventListener('click', closeDrawer);
});

// Close drawer on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeDrawer();
});


/* ==========================================================================
   5. Smooth scroll for nav links (polyfill for Safari)
   ========================================================================== */
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      e.preventDefault();
      const offset = 90; // account for sticky nav
      const top = target.getBoundingClientRect().top + window.pageYOffset - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  });
});


/* ==========================================================================
   6. Auto-start playground simulation on load
   ========================================================================== */
window.addEventListener('DOMContentLoaded', () => {
  updateDatabaseUI();
  runPresetStep();
});
