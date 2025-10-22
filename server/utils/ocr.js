import Tesseract from 'tesseract.js';

let workerInstance = null;

async function getWorker() {
  if (!workerInstance) {
    workerInstance = await Tesseract.createWorker('eng');
  }
  return workerInstance;
}

export async function extractTextFromImage(imageBuffer) {
  let worker;
  try {
    worker = await getWorker();

    const { data: { text, confidence } } = await worker.recognize(imageBuffer);

    return {
      text: text.trim(),
      confidence: Math.round(confidence) / 100
    };
  } catch (error) {
    console.error('OCR Error:', error.message);
    throw new Error('Failed to extract text from image');
  }
}

export async function terminateWorker() {
  if (workerInstance) {
    await workerInstance.terminate();
    workerInstance = null;
  }
}

export function parseDocumentData(frontText, backText = null, documentType = 'id') {
  const combinedText = backText ? `${frontText}\n---BACK---\n${backText}` : frontText;

  const data = {
    firstName: null,
    lastName: null,
    dateOfBirth: null,
    nationality: null,
    documentNumber: null,
    documentExpiry: null,
    address: null,
    state: null,
    licenseClass: null
  };

  extractWithLabels(frontText, backText, data, documentType);

  if (!data.firstName || !data.documentNumber) {
    extractWithPatterns(frontText, backText, data, documentType);
  }

  if (!data.firstName || !data.documentNumber) {
    extractIntelligent(combinedText, data);
  }

  return data;
}

function extractWithLabels(frontText, backText, data, documentType) {
  const text = backText ? `${frontText}\n${backText}` : frontText;

  const patterns = {
    // US Driver's License & ID specific
    name: [
      /(?:NAME|GIVEN\s+NAMES?|SURNAME|FIRST\s+NAME|LAST\s+NAME)[:\s]+([A-Z][A-Z\s]{2,40})/gi,
      /(?:NAME\s+OF\s+CARDHOLDER)[:\s]+([A-Z][A-Z\s]{2,40})/gi
    ],
    fullName: [
      /(?:FULL\s+NAME|NAME\s+OF\s+HOLDER|CARDHOLDER)[:\s]+([A-Z][A-Z\s]{4,50})/gi
    ],
    dob: [
      /(?:DATE\s+OF\s+BIRTH|DOB|BIRTH\s+DATE|BORN)[:\s]+([0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{4})/gi,
      /(?:DOB)[:\s]*([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{4})/gi
    ],
    nationality: [
      /(?:NATIONALITY|COUNTRY|CITIZENSHIP)[:\s]+(USA|UNITED STATES|US|AMERICA)/gi
    ],
    docNumber: [
      /(?:LICENSE\s+NUMBER|LICENSE\s+NO|ID\s+NUMBER|ID\s+NO|DOCUMENT\s+NUMBER)[:\s]+([A-Z0-9]{5,20})/gi,
      /(?:DL\s+NUMBER|LICENSE\s*#)[:\s]*([A-Z0-9]{5,20})/gi
    ],
    expiry: [
      /(?:EXPIRATION\s+DATE|EXPIRY\s+DATE|EXPIRES|VALID\s+UNTIL|EXP\s+DATE)[:\s]+([0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{4})/gi,
      /(?:EXP)[:\s]*([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{4})/gi
    ],
    address: [
      /(?:ADDRESS|RESIDENCE|STREET)[:\s]+([A-Z0-9][A-Z0-9\s,\-\.]{10,100})/gi
    ],
    state: [
      /(?:STATE|PROVINCE)[:\s]+([A-Z]{2})/gi
    ],
    licenseClass: [
      /(?:CLASS|LICENSE\s+CLASS)[:\s]+([A-Z])/gi
    ]
  };

  // Extract full name
  for (const pattern of patterns.fullName) {
    const match = pattern.exec(text);
    if (match) {
      const names = match[1].trim().split(/\s+/);
      if (names.length >= 2) {
        data.firstName = names[0];
        data.lastName = names.slice(1).join(' ');
        break;
      }
    }
  }

  if (!data.firstName) {
    for (const pattern of patterns.name) {
      const match = pattern.exec(text);
      if (match) {
        const names = match[1].trim().split(/\s+/);
        if (names.length >= 2) {
          data.firstName = names[0];
          data.lastName = names.slice(1).join(' ');
          break;
        }
      }
    }
  }

  // Extract DOB
  for (const pattern of patterns.dob) {
    const match = pattern.exec(text);
    if (match) {
      data.dateOfBirth = match[1];
      break;
    }
  }

  // Extract nationality (US)
  for (const pattern of patterns.nationality) {
    const match = pattern.exec(text);
    if (match) {
      data.nationality = 'USA';
      break;
    }
  }

  // Extract document number
  for (const pattern of patterns.docNumber) {
    const match = pattern.exec(text);
    if (match) {
      data.documentNumber = match[1];
      break;
    }
  }

  // Extract expiry
  for (const pattern of patterns.expiry) {
    const match = pattern.exec(text);
    if (match) {
      data.documentExpiry = match[1];
      break;
    }
  }

  // Extract state
  const usStates = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'];
  const stateMatch = text.match(new RegExp(`\\b(${usStates.join('|')})\\b`, 'i'));
  if (stateMatch) {
    data.state = stateMatch[1].toUpperCase();
  }

  // Extract address
  for (const pattern of patterns.address) {
    const match = pattern.exec(text);
    if (match) {
      data.address = match[1].trim();
      break;
    }
  }

  // Extract license class
  for (const pattern of patterns.licenseClass) {
    const match = pattern.exec(text);
    if (match) {
      data.licenseClass = match[1];
      break;
    }
  }
}

function extractWithPatterns(frontText, backText, data, documentType) {
  const text = backText ? `${frontText}\n${backText}` : frontText;
  const normalizedText = text.replace(/\s+/g, ' ').toUpperCase();

  // Set nationality to USA if not already set
  if (!data.nationality && normalizedText.includes('USA')) {
    data.nationality = 'USA';
  }

  // Extract dates (DOB and Expiry)
  const datePatterns = [
    /(\d{2})[\/\-](\d{2})[\/\-](\d{4})/g,
    /(\d{4})[\/\-](\d{2})[\/\-](\d{2})/g
  ];

  const allDates = [];
  datePatterns.forEach(pattern => {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags);
    while ((match = regex.exec(text)) !== null) {
      allDates.push(match[0]);
    }
  });

  if (!data.dateOfBirth && allDates.length >= 1) {
    data.dateOfBirth = allDates[0];
  }
  if (!data.documentExpiry && allDates.length >= 2) {
    data.documentExpiry = allDates[allDates.length - 1];
  }

  // Extract document number
  if (!data.documentNumber) {
    const idPatterns = [
      /\b[A-Z]\d{5,14}\b/g,
      /\b\d{6,15}\b/g,
      /\b[A-Z]{2}\d{5,12}\b/g
    ];

    for (const pattern of idPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        const filtered = matches.filter(num =>
          !allDates.includes(num) &&
          !/^(USA|STATE|LICENSE|DRIVER|IDENTIFICATION)$/i.test(num)
        );

        if (filtered.length > 0) {
          data.documentNumber = filtered[0];
          break;
        }
      }
    }
  }

  // Extract name
  if (!data.firstName || !data.lastName) {
    const skipWords = new Set([
      'USA', 'DRIVER', 'LICENSE', 'STATE', 'IDENTIFICATION', 'CARD', 'ID',
      'MALE', 'FEMALE', 'DATE', 'BIRTH', 'SEX', 'NATIONALITY', 'ADDRESS',
      'EXPIRES', 'EXPIRATION', 'ISSUE', 'ISSUED', 'CLASS', 'RESTRICTIONS',
      'ENDORSEMENTS', 'UNDER', 'OVER', 'SIGNATURE', 'CARDHOLDER', 'OF', 'THE'
    ]);

    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);

    for (const line of lines) {
      const words = line.split(/\s+/).filter(word => word.length > 2);
      const capitalizedWords = words.filter(word =>
        /^[A-Z][A-Z\-]*$/.test(word) &&
        !skipWords.has(word.toUpperCase()) &&
        !/^\d+$/.test(word)
      );

      if (capitalizedWords.length >= 2 && capitalizedWords.length <= 3) {
        if (!data.firstName) {
          data.firstName = capitalizedWords[0];
        }
        if (!data.lastName && capitalizedWords.length > 1) {
          data.lastName = capitalizedWords.slice(1).join(' ');
        }
        break;
      }
    }
  }

  // Extract address from back
  if (backText && !data.address) {
    const addressLine = backText.split('\n').find(line =>
      line.length > 20 && /\d+\s+[A-Z]/.test(line)
    );
    if (addressLine) {
      data.address = addressLine.trim();
    }
  }
}

function extractIntelligent(text, data) {
  // Extract document number if still missing
  if (!data.documentNumber) {
    const allNumbers = text.match(/\b[A-Z0-9]{6,20}\b/g) || [];
    if (allNumbers.length > 0) {
      const idLike = allNumbers
        .filter(n => /\d{6,}/.test(n) || /[A-Z]\d{5,}/.test(n))
        .sort((a, b) => b.length - a.length)[0];

      if (idLike) {
        data.documentNumber = idLike;
      }
    }
  }

  // Extract name intelligently
  if (!data.firstName) {
    const namePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g;
    const matches = text.match(namePattern);
    if (matches && matches.length > 0) {
      const names = matches[0].split(/\s+/);
      if (names.length >= 2) {
        data.firstName = names[0];
        data.lastName = names.slice(1).join(' ');
      } else if (names.length === 1 && matches.length > 1) {
        data.firstName = matches[0];
        data.lastName = matches[1];
      }
    }
  }
}

export function validateOCRData(ocrData, confidence) {
  const validation = {
    valid: true,
    reason: null
  };

  if (confidence < 0.50) {
    validation.valid = false;
    validation.reason = 'Image quality too low. Please retake photo in good lighting.';
    return validation;
  }

  const hasName = ocrData.firstName && ocrData.lastName;
  const hasDate = ocrData.dateOfBirth;
  const hasDocNumber = ocrData.documentNumber;

  const criticalCount = [hasName, hasDate, hasDocNumber].filter(Boolean).length;

  if (criticalCount < 2) {
    validation.valid = false;
    validation.reason = 'Could not extract sufficient data. Please ensure:\n- Image is clear and well-lit\n- All text is visible\n- No glare on document';
    return validation;
  }

  if (!ocrData.firstName || !ocrData.lastName) {
    validation.valid = false;
    validation.reason = 'Could not extract full name. Please retake photo ensuring name is clearly visible.';
    return validation;
  }

  return validation;
}