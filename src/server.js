import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';
import QRCode from 'qrcode';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3080;

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'YOUR_GEMINI_API_KEY_HERE';

// Massage Therapist booking URLs (alphabetical order)
const THERAPIST_BOOKING_URLS = {
  'Amanda O\'Dempsey': 'https://mygcphysio.bookings.pracsuite.com/?p=4819',
  'Elle Badrak': 'https://mygcphysio.bookings.pracsuite.com/?p=530',
  'Frederic Impens': 'https://mygcphysio.bookings.pracsuite.com/?p=534',
  'Katie Harders': 'https://mygcphysio.bookings.pracsuite.com/?p=533',
  'Nicole Grimshaw': 'https://mygcphysio.bookings.pracsuite.com/?p=2179',
  'Payton Windsor': 'https://mygcphysio.bookings.pracsuite.com/?p=4522',
  'Sarah Allcock': 'https://mygcphysio.bookings.pracsuite.com/?p=5446',
  'Trent Ousby': 'https://mygcphysio.bookings.pracsuite.com/?p=2410'
};

// Model configurations
const MODELS = {
  'gemini-2.5-flash': {
    name: 'Gemini 2.5 Flash (Google)',
    provider: 'Google',
    apiKey: GEMINI_API_KEY,
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    maxTokens: 8000,
    maxInputTokens: 1000000
  }
};

const BASE_PROMPT = `From this case note: [CASE_NOTE]. Generate a massage therapy treatment plan in the EXACT structure below, using patient-centered language. Follow the format precisely:

1. Your Starting Point (Today): [2–3 sentences on pain levels, key aggravators, and what you can still do]

2. What's Going On (Assessment Findings): Use EXACTLY this format:
   * Clinical findings: [specific assessment findings]
   * In plain English: [one sentence on what's happening and why symptoms behave as they do]

3. Where You Want to Get To (Goals): Write 3 separate goals, each as a complete sentence with success markers. Use this format:
   [First goal with success marker]
   [Second goal with success marker]
   [Third goal with success marker]

4. Do This Now (Your 1–3 Key Actions for the Week): Write 3 separate actions covering self-care, activity modifications, and home techniques. Use this format:
   [First action - self-care or education with micro-dose and frequency]
   [Second action - activity modification or stretching with micro-dose and frequency]
   [Third action - home techniques with micro-dose and frequency]

5. Treatment Plan: Use EXACTLY this format with two phases:

**Getting You Comfortable** (Acute Phase, [Duration]):
[Write 3-4 sentences: Start by identifying which specific objective findings from the assessment are contributing to the patient's main symptoms. Explain which massage techniques you'll use and how they address these findings. Connect this to one of their goals. End with what improvements they should notice and when.]
Recommended: [X sessions per week]

**Keeping You at Your Best** (Maintenance Phase, Ongoing):
[Write 3-4 sentences: Explain how regular massage therapy maintains their progress and prevents the problem from returning. Reference their lifestyle/work demands that create ongoing tissue stress. Emphasize the value of proactive care - catching tension before it becomes painful. End with a relatable benefit statement.]
Recommended: [X sessions per month/weeks]

6. How We'll Measure Progress: [Specific measures with improvement criteria]

7. What to Expect in the Next 72 Hours: Write 2 separate points:
   [Normal expected response]
   [What's not expected - warning signs]

8. Recommended Appointments: [Summary of appointment schedule]

IMPORTANT: For sections 3, 4, and 7, write each point as a separate line without bullet points (*). Do NOT use bullet points for section 5 - write it as flowing paragraphs with the "Recommended:" line on its own.`;

app.post('/api/generate', async (req, res) => {
  try {
    const { caseNote, patientName, therapistName } = req.body;

    // Enhanced validation
    if (!caseNote || typeof caseNote !== 'string') {
      return res.status(400).json({ error: 'Missing caseNote' });
    }
    if (!patientName || typeof patientName !== 'string') {
      return res.status(400).json({ error: 'Missing patientName' });
    }
    if (!therapistName || typeof therapistName !== 'string') {
      return res.status(400).json({ error: 'Missing therapistName' });
    }
    // Check API key
    if (!GEMINI_API_KEY || GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY_HERE') {
      console.error('Gemini API key not configured');
      return res.status(500).json({
        error: 'API key not configured. Please check environment variables.',
        details: 'GEMINI_API_KEY is missing or not set properly',
        suggestion: 'Go to Vercel Dashboard → Project Settings → Environment Variables → Add GEMINI_API_KEY'
      });
    }

    // Validate API key format (Google API keys typically start with 'AIza')
    if (!GEMINI_API_KEY.startsWith('AIza')) {
      console.error('Invalid API key format');
      return res.status(500).json({
        error: 'Invalid API key format',
        details: 'Google API keys typically start with "AIza". Please check your GEMINI_API_KEY.',
        suggestion: 'Get a valid API key from Google AI Studio: https://aistudio.google.com/app/apikey'
      });
    }

    // Default to Gemini model since it's the only available option
    const modelId = 'gemini-2.5-flash';
    const model = MODELS[modelId];
    if (!model) {
      return res.status(400).json({ error: 'Invalid model selected' });
    }

    const prompt = BASE_PROMPT.replace('[CASE_NOTE]', caseNote.trim());

    console.log('Calling Gemini API with prompt length:', prompt.length);
    console.log('API Key present:', !!GEMINI_API_KEY);
    console.log('API Key length:', GEMINI_API_KEY ? GEMINI_API_KEY.length : 0);

    try {
      const response = await axios.post(`${model.endpoint}?key=${model.apiKey}`, {
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ],
        generationConfig: {
          maxOutputTokens: model.maxTokens,
          temperature: 0.3
        }
      }, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 60000
      });

      console.log('Gemini API response received:', {
        status: response.status,
        hasData: !!response.data,
        hasCandidates: !!response.data?.candidates,
        candidatesLength: response.data?.candidates?.length || 0,
        firstCandidate: response.data?.candidates?.[0] || 'none',
        hasContent: !!response.data?.candidates?.[0]?.content,
        hasParts: !!response.data?.candidates?.[0]?.content?.parts,
        partsLength: response.data?.candidates?.[0]?.content?.parts?.length || 0,
        firstPart: response.data?.candidates?.[0]?.content?.parts?.[0] || 'none',
        hasText: !!response.data?.candidates?.[0]?.content?.parts?.[0]?.text,
        textLength: response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.length || 0,
        finishReason: response.data?.candidates?.[0]?.finishReason,
        contentKeys: response.data?.candidates?.[0]?.content ? Object.keys(response.data.candidates[0].content) : 'none',
        promptFeedback: response.data?.promptFeedback || null
      });

      // Handle different response structures from Gemini
      const candidate = response.data?.candidates?.[0];
      const promptFeedback = response.data?.promptFeedback;
      let text = extractTextFromCandidate(candidate);

      if (!text && candidate?.content?.role === 'model' && candidate?.finishReason === 'MAX_TOKENS') {
        // Handle token limit case - try to get partial response
        console.log('Gemini hit token limit, checking for partial response...');

        // Try to find any text content in the response
        const responseStr = JSON.stringify(response.data);
        const textMatch = responseStr.match(/"text":\s*"([^"]+)"/);
        if (textMatch) {
          text = textMatch[1];
          console.log('Found partial text in response:', text.length, 'characters');
        }
      }

      if (!text) {
        console.error('Could not extract text from Gemini response.', {
          finishReason: candidate?.finishReason,
          blockReason: promptFeedback?.blockReason,
          promptFeedback
        });
        if (promptFeedback?.blockReason) {
          return res.status(403).json({
            error: 'Response blocked by Gemini safety filters',
            details: promptFeedback.blockReason,
            suggestion: 'Try removing or rephrasing content that might trigger safety filters.'
          });
        }
        return res.status(502).json({
          error: 'Empty response from Gemini. Response hit token limit or has unexpected structure.',
          details: {
            finishReason: candidate?.finishReason,
            hasContent: !!candidate?.content,
            contentKeys: candidate?.content ? Object.keys(candidate.content) : 'none'
          }
        });
      }

      console.log('Successfully extracted text from Gemini, length:', text.length);
      return res.json({ text, patientName, therapistName, modelId, modelName: model.name });

    } catch (geminiError) {
      console.error('Gemini API call failed:', {
        error: geminiError.message,
        response: geminiError.response?.data,
        status: geminiError.response?.status,
        statusText: geminiError.response?.statusText,
        responseType: typeof geminiError.response?.data,
        responsePreview: geminiError.response?.data ? String(geminiError.response.data).substring(0, 200) : 'none'
      });

      // Check if response is HTML (common with API key issues)
      const responseData = geminiError.response?.data;
      if (typeof responseData === 'string' && responseData.includes('<html')) {
        return res.status(401).json({
          error: 'Invalid API key or service unavailable',
          details: 'The API returned an HTML error page. Please check your GEMINI_API_KEY environment variable in Vercel.',
          suggestion: 'Go to Vercel Dashboard → Project Settings → Environment Variables → Add GEMINI_API_KEY'
        });
      }

      // Return more specific error information
      if (geminiError.response?.status === 400) {
        return res.status(400).json({
          error: 'Invalid request to Gemini API',
          details: geminiError.response?.data || geminiError.message
        });
      } else if (geminiError.response?.status === 401) {
        return res.status(401).json({
          error: 'Invalid API key',
          details: 'Please check your GEMINI_API_KEY environment variable in Vercel dashboard'
        });
      } else if (geminiError.response?.status === 429) {
        return res.status(429).json({
          error: 'Rate limit exceeded',
          details: 'Too many requests to Gemini API. Please try again later.'
        });
      } else if (geminiError.response?.status === 403) {
        return res.status(403).json({
          error: 'API access forbidden',
          details: 'Your API key may not have access to this model or the service is restricted'
        });
      } else {
        return res.status(502).json({
          error: 'Gemini API error',
          details: geminiError.message,
          status: geminiError.response?.status,
          suggestion: 'Check Vercel function logs for more details'
        });
      }
    }
  } catch (err) {
    console.error('Unexpected error:', err?.response?.data || err.message);
    return res.status(500).json({
      error: 'Internal server error',
      details: err.message || 'An unexpected error occurred'
    });
  }
});

// Synchronous QR code generation function
async function generateQRCodeDataURL(text) {
  try {
    return await QRCode.toDataURL(text, {
      width: 80,
      margin: 2,
      color: {
        dark: '#3A71DA', // Blue color matching the theme
        light: '#FFFFFF'
      }
    });
  } catch (err) {
    console.error('Failed to generate QR code:', err);
    return null;
  }
}

function escapeHtml(text) {
  return text
    .replace(/\*\*/g, '') // Strip markdown bold markers
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function extractTextFromCandidate(candidate) {
  if (!candidate) return '';

  const parts = candidate?.content?.parts;
  const fragments = [];

  if (Array.isArray(parts)) {
    for (const part of parts) {
      if (typeof part?.text === 'string') {
        fragments.push(part.text);
        continue;
      }

      if (part?.functionCall) {
        const args = part.functionCall.args ?? part.functionCall.arguments;
        if (args) {
          fragments.push(typeof args === 'string' ? args : JSON.stringify(args));
        }
        continue;
      }

      const inlineData = part?.inlineData;
      if (inlineData?.mimeType === 'text/plain' && inlineData?.data) {
        try {
          const decoded = Buffer.from(inlineData.data, 'base64').toString('utf8');
          if (decoded) fragments.push(decoded);
        } catch (err) {
          console.warn('Failed to decode inline data from candidate part:', err?.message || err);
        }
        continue;
      }

      if (typeof part?.json === 'object' && part.json !== null) {
        try {
          fragments.push(JSON.stringify(part.json));
        } catch (err) {
          console.warn('Failed to stringify JSON part from candidate:', err?.message || err);
        }
      }
    }
  }

  if (!fragments.length && typeof candidate?.content?.text === 'string') {
    fragments.push(candidate.content.text);
  }

  if (!fragments.length && typeof candidate?.text === 'string') {
    fragments.push(candidate.text);
  }

  return fragments.join('\n').trim();
}

// Common intro phrases that AI generates - these should be filtered out
const INTRO_PHRASE_PATTERNS = [
  /^here\s*(is|'s)\s*(your)?\s*(personalized)?\s*(treatment|massage)?\s*(therapy)?\s*plan:?\.?$/i,
  /^this\s+is\s+(your)?\s*(personalized)?\s*(treatment|massage)?\s*(therapy)?\s*plan:?\.?$/i,
  /^(your)?\s*(personalized)?\s*(treatment|massage)?\s*(therapy)?\s*plan:?\.?$/i,
  /^below\s+(is|are)\s+(your)?\s*(personalized)?\s*(treatment|massage)?\s*plan:?\.?$/i,
  /^i('ve|'ve| have)\s+(created|prepared|developed)\s+(a|your)\s*(personalized)?\s*(treatment|massage)?\s*plan/i,
  /^based\s+on\s+(your|the)\s+(case\s+note|assessment|session)/i,
  /^here('s| is)\s+your\s+plan:?\.?$/i,
];

function isIntroPhrase(line) {
  const trimmed = line.trim();
  return INTRO_PHRASE_PATTERNS.some(pattern => pattern.test(trimmed));
}

function parsePlanText(planText) {
  const lines = (planText || '').split('\n');
  const sections = [];
  let current = null;
  let orphanedLines = []; // Capture content before first section

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const match = line.match(/^\s*(\d)\.\s*(.+)$/);

    if (match) {
      // Save orphaned lines as a special section if any exist (before first section)
      if (orphanedLines.length > 0 && !current) {
        // Filter out common intro phrases and empty lines
        const meaningfulLines = orphanedLines.filter(l => l.trim().length > 0 && !isIntroPhrase(l));
        if (meaningfulLines.length > 0) {
          sections.push({
            number: '0',
            title: 'Additional Notes',
            description: '',
            lines: meaningfulLines,
            isOrphaned: true
          });
          console.log(`Created orphaned section with ${meaningfulLines.length} lines`);
        }
        orphanedLines = [];
      }

      if (current) sections.push(current);

      // Split the matched content into title and description
      const fullContent = match[2].trim();
      let title, description;

      // Look for colon to separate title from description
      const colonIndex = fullContent.indexOf(':');
      if (colonIndex > 0) {
        title = fullContent.substring(0, colonIndex).trim();
        description = fullContent.substring(colonIndex + 1).trim();
      } else {
        title = fullContent;
        description = '';
      }

      current = {
        number: match[1],
        title,
        description,
        lines: []
      };

      // Add description as first content line if it exists
      if (description) {
        current.lines.push(description);
      }

      // Debug logging
      console.log(`Section ${match[1]}: Title="${title}", Description="${description}"`);

      continue;
    }

    if (current) {
      current.lines.push(line);
    } else if (line.trim()) {
      // Content before any section header - capture as orphaned
      orphanedLines.push(line);
    }
  }

  // Handle any remaining orphaned content at the end (if no sections were found)
  if (orphanedLines.length > 0) {
    // Filter out common intro phrases and empty lines
    const meaningfulLines = orphanedLines.filter(l => l.trim().length > 0 && !isIntroPhrase(l));
    if (meaningfulLines.length > 0) {
      sections.push({
        number: '0',
        title: 'Additional Notes',
        description: '',
        lines: meaningfulLines,
        isOrphaned: true
      });
      console.log(`Created trailing orphaned section with ${meaningfulLines.length} lines`);
    }
  }

  if (current) sections.push(current);
  return sections;
}

function renderGoalsSection(section) {
  const lines = section.lines;
  const goals = [];

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine && !trimmedLine.startsWith('"') && !trimmedLine.startsWith('*')) { // Skip bullet points and teach-back lines
      goals.push(trimmedLine);
    }
  }

  // If we have separate lines, use them directly
  if (goals.length >= 3) {
    // Use the first 3 non-empty lines as goals
    const finalGoals = goals.slice(0, 3).filter(goal => goal.length > 0);
    console.log(`Using separate lines as goals:`, finalGoals);

    const goalsHtml = finalGoals.map(goal => `<li>${escapeHtml(goal)}</li>`).join('');

    return `
      <section class="section">
        <h2><span class="num">${section.number}.</span> ${escapeHtml(section.title)}</h2>
        <ul>${goalsHtml}</ul>
      </section>
    `;
  }

  // Fallback: split by periods if we have one long paragraph
  if (goals.length > 0) {
    const allText = goals.join(' ');
    console.log(`Goals section full text: "${allText}"`);

    // Split by periods and clean up each sentence
    const sentences = allText.split('.').filter(s => s.trim().length > 0);
    console.log(`Split into ${sentences.length} sentences:`, sentences);

    goals.length = 0; // Clear the array
    sentences.forEach((sentence, index) => {
      const cleanSentence = sentence.trim();
      if (cleanSentence.length > 0 && !cleanSentence.includes('*')) {
        // Remove any leading/trailing punctuation and clean up
        const finalSentence = cleanSentence.replace(/^[,\s]+|[,\s]+$/g, '');
        if (finalSentence.length > 0) {
          goals.push(finalSentence);
          console.log(`Added goal ${index + 1}: "${finalSentence}"`);
        }
      }
    });
  }

  console.log(`Final goals array:`, goals);

  const goalsHtml = goals.map(goal => `<li>${escapeHtml(goal)}</li>`).join('');

  return `
    <section class="section">
      <h2><span class="num">${section.number}.</span> ${escapeHtml(section.title)}</h2>
      <ul>${goalsHtml}</ul>
    </section>
  `;
}

function renderKeyActionsSection(section) {
  const lines = section.lines;
  const actions = [];

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine && !trimmedLine.startsWith('"') && !trimmedLine.startsWith('*')) { // Skip bullet points and teach-back lines
      actions.push(trimmedLine);
    }
  }

  // If we have separate lines, use them directly
  if (actions.length >= 3) {
    // Use the first 3 non-empty lines as actions
    const finalActions = actions.slice(0, 3).filter(action => action.length > 0);
    console.log(`Using separate lines as actions:`, finalActions);

    const actionsHtml = finalActions.map(action => `<li>${escapeHtml(action)}</li>`).join('');

    return `
      <section class="section">
        <h2><span class="num">${section.number}.</span> ${escapeHtml(section.title)}</h2>
        <ol>${actionsHtml}</ol>
      </section>
    `;
  }

  // Fallback: split by periods if we have one long paragraph
  if (actions.length > 0) {
    const allText = actions.join(' ');
    console.log(`Actions section full text: "${allText}"`);

    // Split by periods and clean up each sentence
    const sentences = allText.split('.').filter(s => s.trim().length > 0);
    console.log(`Split into ${sentences.length} sentences:`, sentences);

    actions.length = 0; // Clear the array
    sentences.forEach((sentence, index) => {
      const cleanSentence = sentence.trim();
      if (cleanSentence.length > 0 && !cleanSentence.includes('*')) {
        // Remove any leading/trailing punctuation and clean up
        const finalSentence = cleanSentence.replace(/^[,\s]+|[,\s]+$/g, '');
        if (finalSentence.length > 0) {
          actions.push(finalSentence);
          console.log(`Added action ${index + 1}: "${finalSentence}"`);
        }
      }
    });
  }

  console.log(`Final actions array:`, actions);

  const actionsHtml = actions.map(action => `<li>${escapeHtml(action)}</li>`).join('');

  return `
    <section class="section">
      <h2><span class="num">${section.number}.</span> ${escapeHtml(section.title)}</h2>
      <ol>${actionsHtml}</ol>
    </section>
  `;
}

function renderTreatmentPlanSection(section) {
  const lines = section.lines;
  const phases = [];
  let currentPhase = null;

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Check if this is a phase header (contains "Getting You Comfortable" or "Keeping You at Your Best")
    if (trimmedLine.includes('Getting You Comfortable') || trimmedLine.includes('Keeping You at Your Best')) {
      if (currentPhase) {
        phases.push(currentPhase);
      }

      // Extract phase title and duration info
      // Format: **Getting You Comfortable** (Acute Phase, 2-4 weeks):
      const headerMatch = trimmedLine.match(/\*?\*?([^*]+)\*?\*?\s*\(([^)]+)\)/);
      if (headerMatch) {
        currentPhase = {
          title: headerMatch[1].trim(),
          subtitle: headerMatch[2].trim(),
          content: [],
          recommended: ''
        };
      } else {
        currentPhase = {
          title: trimmedLine.replace(/\*+/g, '').trim(),
          subtitle: '',
          content: [],
          recommended: ''
        };
      }
    } else if (currentPhase) {
      // Check if this is a "Recommended:" line
      const recommendedMatch = trimmedLine.match(/^Recommended:\s*(.+)/i);
      if (recommendedMatch) {
        currentPhase.recommended = recommendedMatch[1].trim();
      } else if (trimmedLine.length > 0 && !trimmedLine.startsWith('**')) {
        // Add to content (paragraph text)
        currentPhase.content.push(trimmedLine);
      }
    }
  }

  if (currentPhase) {
    phases.push(currentPhase);
  }

  // Build the HTML for the two-phase narrative format
  let html = `
    <section class="section treatment-plan-section">
      <h2><span class="num">${section.number}.</span> ${escapeHtml(section.title)}</h2>
  `;

  for (const phase of phases) {
    const contentText = phase.content.join(' ').trim();

    html += `
      <div class="treatment-phase-card">
        <div class="treatment-phase-header">
          <span class="treatment-phase-title">${escapeHtml(phase.title)}</span>
          ${phase.subtitle ? `<span class="treatment-phase-subtitle">(${escapeHtml(phase.subtitle)})</span>` : ''}
        </div>
        <div class="treatment-phase-content">
          <p>${escapeHtml(contentText)}</p>
        </div>
        ${phase.recommended ? `
        <div class="treatment-phase-recommended">
          <strong>Recommended:</strong> ${escapeHtml(phase.recommended)}
        </div>
        ` : ''}
      </div>
    `;
  }

  html += `
    </section>
  `;

  return html;
}

async function renderStructuredHtml(planText, patientName = '', therapistName = '') {
  const sections = parsePlanText(planText);
  console.log(`Parsed ${sections.length} sections:`, sections.map(s => ({ number: s.number, title: s.title, linesCount: s.lines.length })));

  // Generate QR code for the therapist if available
  let qrCodeHtml = '';
  if (therapistName && THERAPIST_BOOKING_URLS[therapistName]) {
    const bookingUrl = THERAPIST_BOOKING_URLS[therapistName];
    const qrCodeDataUrl = await generateQRCodeDataURL(bookingUrl);
    if (qrCodeDataUrl) {
      qrCodeHtml = `
        <div class="qr-code-container">
          <div class="qr-code-label">
            <a href="${bookingUrl}" target="_blank" class="booking-link">Book with ${therapistName}</a>
          </div>
          <div class="qr-code-wrapper">
            <img src="${qrCodeDataUrl}" alt="QR Code for ${therapistName}" class="qr-code" />
          </div>
        </div>
      `;
    }
  }

  const sectionHtml = sections.map(sec => {
    const items = [];
    const bullets = [];

    console.log(`Processing section ${sec.number}:`, sec.lines);

    // Special handling for orphaned sections (content before section headers)
    if (sec.isOrphaned) {
      for (const l of sec.lines) {
        if (/^\s*[-*•]\s+/.test(l)) {
          bullets.push(`<li>${escapeHtml(l.replace(/^\s*[-*•]\s+/, ''))}</li>`);
        } else if (l.trim().length > 0) {
          if (bullets.length) {
            items.push(`<ul>${bullets.join('')}</ul>`);
            bullets.length = 0;
          }
          items.push(`<p>${escapeHtml(l)}</p>`);
        }
      }
      if (bullets.length) items.push(`<ul>${bullets.join('')}</ul>`);

      console.log(`Orphaned section items:`, items);

      return `
        <section class="section orphaned-section">
          <h2>${escapeHtml(sec.title)}</h2>
          ${items.join('\n')}
        </section>
      `;
    }

    // Special handling for Treatment Plan (section 5)
    if (sec.number === '5' && sec.title.includes('Treatment Plan')) {
      return renderTreatmentPlanSection(sec);
    }

    // Special handling for Goals (section 3) - ensure bullet points
    if (sec.number === '3' && sec.title.includes('Goals')) {
      return renderGoalsSection(sec);
    }

    // Special handling for Key Actions (section 4) - ensure numbered list
    if (sec.number === '4' && sec.title.includes('Key Actions')) {
      return renderKeyActionsSection(sec);
    }

    for (const l of sec.lines) {
      if (/^\s*[-*•]\s+/.test(l)) {
        bullets.push(`<li>${escapeHtml(l.replace(/^\s*[-*•]\s+/, ''))}</li>`);
      } else if (l.trim().length > 0) {
        if (bullets.length) {
          items.push(`<ul>${bullets.join('')}</ul>`);
          bullets.length = 0;
        }
        items.push(`<p>${escapeHtml(l)}</p>`);
      }
    }
    if (bullets.length) items.push(`<ul>${bullets.join('')}</ul>`);

    console.log(`Section ${sec.number} items:`, items);

    return `
      <section class="section">
        <h2><span class="num">${sec.number}.</span> ${escapeHtml(sec.title)}</h2>
        ${items.join('\n')}
      </section>
    `;
  }).join('\n');

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Gold Coast Physio & Sports Health - Massage Treatment Plan for ${patientName || 'Patient'}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
      :root { --blue: #3A71DA; --orange: #FF7300; --text: #1F2937; --muted: #6B7280; }
      body { font-family: 'Inter', system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: var(--text); margin: 0; background: #F7FAFF; }
      .page { max-width: 860px; margin: 32px auto; background: #fff; box-shadow: 0 10px 30px rgba(0,0,0,0.07); border-radius: 16px; overflow: hidden; }
      header { display: flex; align-items: center; gap: 16px; padding: 20px 24px; background: linear-gradient(180deg, #EEF4FF 0%, #ffffff 100%); border-bottom: 1px solid #E5E7EB; }
      header img { height: 56px; }
      header .title { flex: 1; }
      h1 { margin: 0; font-size: 22px; color: var(--blue); letter-spacing: 0.2px; }
      .patient-info { color: var(--muted); font-size: 13px; margin-top: 4px; }
      main { padding: 28px 24px 36px; }
      .section { margin-bottom: 18px; }
      .section h2 { display: flex; align-items: center; gap: 8px; color: var(--blue); font-size: 16px; margin: 18px 0 8px; border-left: 4px solid var(--orange); padding-left: 10px; }
      .section p, .section li { line-height: 1.55; font-size: 14px; }
      .section ul, .section ol { margin: 8px 0 8px 20px; }
      .section ol { counter-reset: item; }
      .section ol li { display: block; }
      .section ol li:before { content: counter(item) ". "; counter-increment: item; font-weight: 600; color: var(--blue); }
      .phase-table { width: 100%; border-collapse: collapse; margin: 16px 0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
      .phase-table th { background: var(--blue); color: white; padding: 12px 8px; text-align: left; font-weight: 600; font-size: 13px; }
      .phase-table td { padding: 12px 8px; border-bottom: 1px solid #E5E7EB; vertical-align: top; font-size: 13px; line-height: 1.4; }
      .phase-table tr:last-child td { border-bottom: none; }
      .phase-table tr:nth-child(even) { background: #F8FAFC; }
      .phase-table tr:hover { background: #F1F5F9; }

      /* Enhanced print styles to preserve colors */
      @media print {
        * {
          -webkit-print-color-adjust: exact !important;
          color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        body {
          background: white !important;
          margin: 0 !important;
          -webkit-print-color-adjust: exact !important;
        }
        .page {
          box-shadow: none !important;
          margin: 0 !important;
          max-width: none !important;
          background: white !important;
        }
        header {
          background: linear-gradient(180deg, #EEF4FF 0%, #ffffff 100%) !important;
          -webkit-print-color-adjust: exact !important;
        }
        h1 { color: #3A71DA !important; }
        .section h2 {
          color: #3A71DA !important;
          border-left: 4px solid #FF7300 !important;
        }
        .phase-table {
          border-collapse: collapse !important;
          -webkit-print-color-adjust: exact !important;
        }
        .phase-table th {
          background: #3A71DA !important;
          color: white !important;
          -webkit-print-color-adjust: exact !important;
        }
        .phase-table tr:nth-child(even) {
          background: #F8FAFC !important;
          -webkit-print-color-adjust: exact !important;
        }
        .phase-table tr:nth-child(odd) {
          background: white !important;
          -webkit-print-color-adjust: exact !important;
        }
        .phase-name {
          background: #FF7300 !important;
          color: white !important;
          -webkit-print-color-adjust: exact !important;
        }
        .badge {
          background: rgba(58,113,218,0.15) !important;
          color: #3A71DA !important;
          border: 1px solid rgba(58,113,218,0.3) !important;
          -webkit-print-color-adjust: exact !important;
        }
        .accent { color: #FF7300 !important; }
        .patient-info { color: #6B7280 !important; }
        footer {
          border-top: 1px solid #E5E7EB !important;
          color: #6B7280 !important;
        }
        .qr-code-container {
          background: #F8FAFC !important;
          -webkit-print-color-adjust: exact !important;
        }
        .booking-link { color: #3A71DA !important; }
        .section ol li:before { color: #3A71DA !important; }

        /* Treatment Plan Phase Cards print styles */
        .treatment-phase-card {
          background: #F8FAFC !important;
          border-left: 4px solid #FF7300 !important;
          -webkit-print-color-adjust: exact !important;
        }
        .treatment-phase-card:first-of-type {
          border-left-color: #3A71DA !important;
        }
        .treatment-phase-title { color: #3A71DA !important; }
        .treatment-phase-subtitle { color: #6B7280 !important; }
        .treatment-phase-recommended {
          background: rgba(58,113,218,0.08) !important;
          color: #3A71DA !important;
          -webkit-print-color-adjust: exact !important;
        }
        .treatment-phase-recommended strong { color: #FF7300 !important; }

        /* Ensure table borders are visible */
        .phase-table td {
          border-bottom: 1px solid #E5E7EB !important;
        }
        .phase-table th {
          border-bottom: 2px solid #2C5AA0 !important;
        }
      }
      .phase-name { background: var(--orange); color: white; font-weight: 600; padding: 6px 10px; border-radius: 6px; display: inline-block; margin-bottom: 6px; font-size: 12px; }
      .phase-table .content-cell { max-width: 200px; word-wrap: break-word; }
      /* Treatment Plan Phase Cards */
      .treatment-plan-section { margin-bottom: 24px; }
      .treatment-phase-card { background: #F8FAFC; border-radius: 12px; padding: 20px; margin: 16px 0; border-left: 4px solid var(--orange); }
      .treatment-phase-card:first-of-type { border-left-color: var(--blue); }
      .treatment-phase-header { margin-bottom: 12px; }
      .treatment-phase-title { font-size: 16px; font-weight: 600; color: var(--blue); }
      .treatment-phase-subtitle { font-size: 13px; color: var(--muted); margin-left: 8px; }
      .treatment-phase-content { margin-bottom: 12px; }
      .treatment-phase-content p { margin: 0; line-height: 1.6; font-size: 14px; color: var(--text); }
      .treatment-phase-recommended { background: rgba(58,113,218,0.08); padding: 10px 14px; border-radius: 8px; font-size: 13px; color: var(--blue); }
      .treatment-phase-recommended strong { color: var(--orange); }
      .badge { display: inline-block; background: rgba(58,113,218,0.08); color: var(--blue); border: 1px solid rgba(58,113,218,0.22); padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
      footer { padding: 18px 24px; font-size: 12px; color: var(--muted); border-top: 1px solid #E5E7EB; display:flex; justify-content: space-between; align-items:center; }
      .accent { color: var(--orange); }
      .qr-code-container { display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 120px; }
      .qr-code-label { font-size: 12px; color: var(--blue); font-weight: 600; margin-bottom: 8px; text-align: center; }
      .qr-code-wrapper { margin-bottom: 6px; }
      .qr-code { width: 80px; height: 80px; border-radius: 8px; }
      .booking-url { font-size: 10px; color: var(--muted); text-align: center; max-width: 100px; word-wrap: break-word; }
      .booking-link { color: var(--blue); text-decoration: none; }
      .booking-link:hover { text-decoration: underline; }
    </style>
  </head>
  <body>
    <div class="page">
      <header>
        <img src="https://www.mygcphysio.com.au/wp-content/uploads/2024/09/GCPSH-Colour-500px.png" alt="Gold Coast Physio & Sports Health" />
        <div class="title">
          <h1>Massage Treatment Plan</h1>
          ${patientName ? `<div class="patient-info">Patient: ${escapeHtml(patientName)} | Date: ${new Date().toLocaleDateString('en-GB', {day: '2-digit', month: '2-digit', year: 'numeric'})} | Therapist: ${escapeHtml(therapistName)}</div>` : ''}
        </div>
        ${qrCodeHtml}
      </header>
      <main>
        ${sectionHtml || `<div class="section"><p>${escapeHtml(planText).replace(/\n/g,'<br/>')}</p></div>`}
      </main>
      <footer>
        <div>Generated on ${new Date().toLocaleDateString('en-GB', {day: '2-digit', month: '2-digit', year: 'numeric'})}</div>
        <div class="accent">mygcphysio.com.au | (07) 5500 6470</div>
      </footer>
    </div>
  </body>
</html>`;
}

app.post('/api/render-html', async (req, res) => {
  try {
    const { planText, patientName, therapistName } = req.body;
    if (!planText) return res.status(400).json({ error: 'Missing planText' });
    const html = await renderStructuredHtml(planText, patientName, therapistName);
    return res.json({ html });
  } catch (err) {
    console.error(err?.message || err);
    return res.status(500).json({ error: 'Failed to render HTML' });
  }
});

app.get('/api/models', (req, res) => {
  try {
    const modelList = Object.entries(MODELS).map(([id, model]) => ({
      id,
      name: model.name,
      provider: model.provider,
      maxTokens: model.maxTokens,
      maxInputTokens: model.maxInputTokens
    }));
    return res.json(modelList);
  } catch (err) {
    console.error(err?.message || err);
    return res.status(500).json({ error: 'Failed to get models' });
  }
});

app.get('/api/qr-code/:therapistName', async (req, res) => {
  try {
    const { therapistName } = req.params;
    const decodedName = decodeURIComponent(therapistName);

    const bookingUrl = THERAPIST_BOOKING_URLS[decodedName];
    if (!bookingUrl) {
      return res.status(404).json({ error: 'Therapist not found' });
    }

    // Generate QR code as data URL
    const qrCodeDataUrl = await QRCode.toDataURL(bookingUrl, {
      width: 120,
      margin: 2,
      color: {
        dark: '#3A71DA', // Blue color matching the theme
        light: '#FFFFFF'
      }
    });

    res.setHeader('Content-Type', 'application/json');
    return res.json({
      qrCode: qrCodeDataUrl,
      bookingUrl: bookingUrl,
      therapistName: decodedName
    });
  } catch (err) {
    console.error(err?.message || err);
    return res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// New endpoint for print-optimized HTML
app.post('/api/print', async (req, res) => {
  try {
    const { planText, patientName, therapistName } = req.body;
    if (!planText) return res.status(400).json({ error: 'Missing planText' });

    const html = await renderStructuredHtml(planText, patientName, therapistName);

    // Return HTML optimized for printing
    res.setHeader('Content-Type', 'text/html');
    return res.send(html);
  } catch (err) {
    console.error('Print HTML generation error:', err);
    return res.status(500).json({
      error: 'Failed to generate print view',
      details: err.message
    });
  }
});

// Keep the PDF endpoint as fallback
app.post('/api/pdf', async (req, res) => {
  try {
    const { planText, patientName, therapistName } = req.body;
    if (!planText) return res.status(400).json({ error: 'Missing planText' });

    const html = await renderStructuredHtml(planText, patientName, therapistName);

    // Try Puppeteer first
    try {
      const browser = await puppeteer.launch({
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor'
        ],
        headless: true
      });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
      const pdfBuffer = await page.pdf({
        format: 'A4',
        margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
        printBackground: true,
        timeout: 30000,
        preferCSSPageSize: false,
        displayHeaderFooter: false
      });
      await browser.close();

      res.setHeader('Content-Type', 'application/pdf');
      const filename = patientName ? `massage-treatment-plan-${patientName.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-')}.pdf` : 'massage-treatment-plan.pdf';
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(pdfBuffer);
    } catch (puppeteerError) {
      console.error('Puppeteer PDF generation failed:', puppeteerError);

      // Fallback: return HTML with print instructions
      const printHtml = html.replace(
        '</head>',
        `
        <style>
          @media print {
            body { margin: 0; }
            .no-print { display: none !important; }
            .print-instructions {
              position: fixed;
              top: 0;
              left: 0;
              right: 0;
              background: #f0f0f0;
              padding: 10px;
              text-align: center;
              border-bottom: 2px solid #ccc;
              font-family: Arial, sans-serif;
            }
          }
          .print-instructions {
            background: #e3f2fd;
            padding: 15px;
            margin: 20px 0;
            border-radius: 8px;
            border-left: 4px solid #2196f3;
            font-family: Arial, sans-serif;
          }
          .print-instructions h3 {
            margin: 0 0 10px 0;
            color: #1976d2;
          }
          .print-instructions p {
            margin: 5px 0;
            color: #424242;
          }
        </style>
        <script>
          // Auto-print when page loads (only once)
          (function() {
            var hasPrinted = false;
            window.onload = function() {
              if (hasPrinted) return;
              hasPrinted = true;
              setTimeout(function() {
                window.print();
              }, 1000);
            };
          })();
        </script>
        </head>`
      );

      res.setHeader('Content-Type', 'text/html');
      return res.send(printHtml);
    }
  } catch (err) {
    console.error('PDF generation error:', err);
    return res.status(500).json({
      error: 'Failed to create PDF',
      details: err.message,
      suggestion: 'Try using the browser\'s print function instead'
    });
  }
});

// Serve static files and catch-all for non-API routes
app.get('*', (req, res) => {
  // Don't serve HTML for API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Export the app for Vercel
export default app;

// Only start the server if running locally
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
