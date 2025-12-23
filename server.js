const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const multer = require('multer');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 3000;

// Create necessary directories
const dataDir = path.join(__dirname, 'data');
const facesDir = path.join(__dirname, 'faces');
const publicDir = path.join(__dirname, 'public');

// Ensure directories exist
[dataDir, facesDir, publicDir].forEach(dir => {
  if (!fsSync.existsSync(dir)) {
    fsSync.mkdirSync(dir, { recursive: true });
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(publicDir));
app.use('/faces', express.static(facesDir));

// Multer configuration for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, facesDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Path to profiles JSON
const PROFILES_FILE = path.join(dataDir, 'profiles.json');

// Initialize profiles file if it doesn't exist
async function initializeProfilesFile() {
  try {
    await fs.access(PROFILES_FILE);
  } catch {
    await fs.writeFile(PROFILES_FILE, JSON.stringify({ profiles: [] }, null, 2));
  }
}

// Load profiles
async function loadProfiles() {
  try {
    const data = await fs.readFile(PROFILES_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading profiles:', error);
    return { profiles: [] };
  }
}

// Save profiles
async function saveProfiles(profiles) {
  try {
    await fs.writeFile(PROFILES_FILE, JSON.stringify(profiles, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving profiles:', error);
    return false;
  }
}

// Generate a simple face signature (placeholder for actual face detection)
// In a real app, you would use face-api.js or similar here
async function generateFaceSignature(imagePath) {
  // This is a placeholder - in reality, you would use face-api.js
  // to extract actual face descriptors
  // For demo purposes, we'll generate a mock descriptor
  const mockDescriptor = Array(128).fill(0).map(() => Math.random());
  return mockDescriptor;
}

// Simple mock face matching (placeholder)
async function findMatchingProfile(imagePath, threshold = 0.6) {
  try {
    const data = await loadProfiles();
    const mockDescriptor = await generateFaceSignature(imagePath);
    
    // For demo, just return the first profile
    if (data.profiles.length > 0) {
      return {
        match: true,
        profile: data.profiles[0],
        confidence: 0.8
      };
    }
    
    return { match: false };
  } catch (error) {
    console.error('Error in face matching:', error);
    return { match: false };
  }
}

// API Routes

// Get all profiles
app.get('/api/profiles', async (req, res) => {
  try {
    const data = await loadProfiles();
    res.json(data.profiles);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load profiles' });
  }
});

// Get single profile
app.get('/api/profiles/:id', async (req, res) => {
  try {
    const data = await loadProfiles();
    const profile = data.profiles.find(p => p.id === req.params.id);
    
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    res.json(profile);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

// Create new profile
app.post('/api/profiles', upload.array('faces', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'At least one face image is required' });
    }

    const { name, contact, place } = req.body;
    
    if (!name || !contact) {
      return res.status(400).json({ error: 'Name and contact are required' });
    }

    const data = await loadProfiles();
    const newId = uuidv4();
    
    // Process each uploaded image
    const faces = [];
    const descriptors = [];
    
    for (const file of req.files) {
      faces.push(file.filename);
      // Generate mock descriptor for demo
      const mockDescriptor = Array(128).fill(0).map(() => Math.random());
      descriptors.push(mockDescriptor);
    }
    
    const newProfile = {
      id: newId,
      name,
      contact,
      place: place || '',
      faces,
      descriptors,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    data.profiles.push(newProfile);
    await saveProfiles(data);
    
    res.status(201).json(newProfile);
  } catch (error) {
    console.error('Error creating profile:', error);
    res.status(500).json({ error: 'Failed to create profile' });
  }
});

// Update profile
app.put('/api/profiles/:id', upload.array('newFaces', 10), async (req, res) => {
  try {
    const data = await loadProfiles();
    const profileIndex = data.profiles.findIndex(p => p.id === req.params.id);
    
    if (profileIndex === -1) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    const profile = data.profiles[profileIndex];
    const { name, contact, place, facesToRemove = [] } = req.body;
    
    // Update basic info
    profile.name = name || profile.name;
    profile.contact = contact || profile.contact;
    profile.place = place || profile.place;
    
    // Remove specified faces
    if (Array.isArray(facesToRemove)) {
      for (const filename of facesToRemove) {
        const faceIndex = profile.faces.indexOf(filename);
        if (faceIndex > -1) {
          // Remove file from disk
          await fs.unlink(path.join(facesDir, filename)).catch(console.error);
          // Remove from arrays
          profile.faces.splice(faceIndex, 1);
          profile.descriptors.splice(faceIndex, 1);
        }
      }
    }
    
    // Add new faces
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        profile.faces.push(file.filename);
        // Generate mock descriptor for demo
        const mockDescriptor = Array(128).fill(0).map(() => Math.random());
        profile.descriptors.push(mockDescriptor);
      }
    }
    
    profile.updatedAt = new Date().toISOString();
    
    await saveProfiles(data);
    res.json(profile);
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Delete profile
app.delete('/api/profiles/:id', async (req, res) => {
  try {
    const data = await loadProfiles();
    const profileIndex = data.profiles.findIndex(p => p.id === req.params.id);
    
    if (profileIndex === -1) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    const profile = data.profiles[profileIndex];
    
    // Delete all face images
    for (const filename of profile.faces) {
      await fs.unlink(path.join(facesDir, filename)).catch(console.error);
    }
    
    // Remove from array
    data.profiles.splice(profileIndex, 1);
    await saveProfiles(data);
    
    res.json({ message: 'Profile deleted successfully' });
  } catch (error) {
    console.error('Error deleting profile:', error);
    res.status(500).json({ error: 'Failed to delete profile' });
  }
});

// Recognize face from image
app.post('/api/recognize', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image provided' });
    }
    
    const imagePath = path.join(facesDir, req.file.filename);
    
    // Find matching profile (mock implementation)
    const result = await findMatchingProfile(imagePath);
    
    // Clean up uploaded file
    await fs.unlink(imagePath).catch(console.error);
    
    if (result.match) {
      res.json({ 
        match: true, 
        profile: result.profile,
        confidence: result.confidence || 0.8
      });
    } else {
      res.json({ 
        match: false, 
        message: 'No matching profile found' 
      });
    }
  } catch (error) {
    console.error('Error recognizing face:', error);
    res.status(500).json({ error: 'Failed to recognize face' });
  }
});

// Initialize and start server
async function startServer() {
  await initializeProfilesFile();
  
  app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log(`👤 Private Face Management App for KK`);
    console.log(`📁 Profiles data: ${PROFILES_FILE}`);
    console.log(`📸 Faces storage: ${facesDir}`);
    console.log(`\n⚠️  NOTE: Face recognition is in demo mode.`);
    console.log(`   For actual face detection, install face-api.js:`);
    console.log(`   1. npm install face-api.js canvas`);
    console.log(`   2. Download models from face-api.js repository`);
    console.log(`   3. Uncomment face-api.js code in server.js`);
  });
}

startServer().catch(console.error);