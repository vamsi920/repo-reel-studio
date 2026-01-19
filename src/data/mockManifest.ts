import type { VideoManifest } from "@/lib/geminiDirector";

export const mockManifest: VideoManifest = {
  title: "Sous Chef: AI-Powered Autonomous Cooking Companion Walkthrough",
  scenes: [
    {
      id: 1,
      type: "intro",
      file_path: "README.md",
      highlight_lines: [1, 15],
      narration_text:
        "Sous Chef is a revolutionary AI-powered autonomous cooking companion built for the AWS AI Agent Global Hackathon 2025. This React Native mobile application transforms your existing groceries into personalized, nutritious meal plans using Amazon Bedrock's generative AI capabilities.",
      duration_seconds: 15,
      title: "Introduction to Sous Chef",
      code: `# Sous Chef 🧑‍🍳

> AI-Powered Autonomous Cooking Companion

## Overview

Sous Chef transforms your existing groceries into personalized,
nutritious meal plans using Amazon Bedrock's generative AI.

### Key Features

- 🤖 AI-powered recipe generation
- 📱 React Native mobile app
- 🔥 Firebase real-time sync
- 💾 Smart caching system
- 🥗 Dietary preference support

## Built With

- React Native + Expo SDK 54
- TypeScript for type safety
- Amazon Bedrock for AI reasoning
- Firebase for authentication

## Getting Started

\`\`\`bash
npm install
npx expo start
\`\`\`
`,
    },
    {
      id: 2,
      type: "overview",
      file_path: "package.json",
      highlight_lines: [1, 25],
      narration_text:
        "The project architecture is built on a modern tech stack featuring React Native with Expo SDK 54 and TypeScript for type safety. It utilizes Expo Router for file-based navigation and the React Context API for global state management.",
      duration_seconds: 15,
      title: "Project Structure & Tech Stack",
      code: `{
  "name": "sous-chef",
  "version": "1.0.0",
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "web": "expo start --web",
    "lint": "eslint . --ext .ts,.tsx",
    "test": "jest"
  },
  "dependencies": {
    "expo": "~54.0.0",
    "expo-router": "~4.0.0",
    "react": "18.3.1",
    "react-native": "0.76.0",
    "@aws-sdk/client-bedrock-runtime": "^3.500.0",
    "firebase": "^10.8.0",
    "@react-native-async-storage/async-storage": "^1.21.0"
  },
  "devDependencies": {
    "@types/react": "~18.3.0",
    "typescript": "^5.3.0",
    "eslint": "^8.57.0"
  }
}`,
    },
    {
      id: 3,
      type: "entry",
      file_path: "app/_layout.tsx",
      highlight_lines: [1, 30],
      narration_text:
        "The root layout file serves as the main entry point for the application's navigation and provider tree. It wraps the entire app in the AuthProvider and AppProvider to ensure that authentication state and global application logic are accessible everywhere.",
      duration_seconds: 14,
      title: "Application Bootstrap",
      code: `import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider } from '@/context/AuthContext';
import { AppProvider } from '@/context/AppContext';
import { ThemeProvider } from '@/theme/ThemeProvider';

// Prevent splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    'Inter-Regular': require('@/assets/fonts/Inter-Regular.ttf'),
    'Inter-Bold': require('@/assets/fonts/Inter-Bold.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <ThemeProvider>
      <AuthProvider>
        <AppProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="onboarding" />
            <Stack.Screen name="recipes/[id]" />
          </Stack>
        </AppProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}`,
    },
    {
      id: 4,
      type: "entry",
      file_path: "src/context/AuthContext.tsx",
      highlight_lines: [5, 35],
      narration_text:
        "The AuthContext is responsible for managing the user's authentication lifecycle using Firebase Authentication. It provides a custom useAuth hook that allows any component to access the current user's profile and sign-in status easily.",
      duration_seconds: 15,
      title: "Authentication Management",
      code: `import { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Subscribe to auth state changes
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signOutUser = async () => {
    await signOut(auth);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signOutUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};`,
    },
    {
      id: 5,
      type: "entry",
      file_path: "src/context/AppContext.tsx",
      highlight_lines: [15, 50],
      narration_text:
        "AppContext acts as the central nervous system of the application, managing everything from the inventory of groceries to the active meal suggestions. It coordinates the interaction between the local UI state and the backend services.",
      duration_seconds: 15,
      title: "Global State Management",
      code: `import { createContext, useContext, useState, useCallback } from 'react';
import { generateRecipe } from '@/lib/bedrockService';
import { Recipe, MealSlot, Grocery } from '@/types';

interface AppContextType {
  groceries: Grocery[];
  activeMealSlot: MealSlot;
  currentRecipe: Recipe | null;
  isGenerating: boolean;
  setGroceries: (items: Grocery[]) => void;
  generateAIRecipe: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [groceries, setGroceries] = useState<Grocery[]>([]);
  const [activeMealSlot, setActiveMealSlot] = useState<MealSlot>('lunch');
  const [currentRecipe, setCurrentRecipe] = useState<Recipe | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const generateAIRecipe = useCallback(async () => {
    if (groceries.length === 0) {
      throw new Error('No groceries available');
    }

    setIsGenerating(true);
    try {
      const recipe = await generateRecipe({
        groceries,
        mealSlot: activeMealSlot,
        preferences: getUserPreferences(),
      });
      setCurrentRecipe(recipe);
    } finally {
      setIsGenerating(false);
    }
  }, [groceries, activeMealSlot]);

  return (
    <AppContext.Provider
      value={{
        groceries,
        activeMealSlot,
        currentRecipe,
        isGenerating,
        setGroceries,
        generateAIRecipe,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
};`,
    },
    {
      id: 6,
      type: "core",
      file_path: "app/(tabs)/home.tsx",
      highlight_lines: [10, 40],
      narration_text:
        "The home screen is the primary dashboard where users interact with their daily meal plan. It features a dynamic feed that displays scheduled recipes for breakfast, lunch, and dinner based on the current time of day.",
      duration_seconds: 15,
      title: "Home Dashboard",
      code: `import { View, Text, ScrollView, Pressable } from 'react-native';
import { useMemo } from 'react';
import { useApp } from '@/context/AppContext';
import { RecipeCard } from '@/components/RecipeCard';
import { MealSlotSelector } from '@/components/MealSlotSelector';
import { AIGenerateButton } from '@/components/AIGenerateButton';
import { getDailyMessage } from '@/lib/dailyRecipeScheduler';

export default function HomeScreen() {
  const { currentRecipe, activeMealSlot, isGenerating, generateAIRecipe } = useApp();

  const combinedMessage = useMemo(() => {
    const greeting = getTimeBasedGreeting();
    const motivation = getDailyMessage();
    return \`\${greeting} \${motivation}\`;
  }, []);

  return (
    <ScrollView className="flex-1 bg-background">
      <View className="p-6">
        {/* Header */}
        <Text className="text-2xl font-bold text-foreground mb-2">
          {combinedMessage}
        </Text>
        
        {/* Meal Slot Selector */}
        <MealSlotSelector 
          current={activeMealSlot} 
          onChange={setActiveMealSlot}
        />

        {/* Current Recipe or Generate Button */}
        {currentRecipe ? (
          <RecipeCard recipe={currentRecipe} />
        ) : (
          <AIGenerateButton
            onPress={generateAIRecipe}
            loading={isGenerating}
          />
        )}

        {/* Timer Widget */}
        <TimerWidget mealSlot={activeMealSlot} />
      </View>
    </ScrollView>
  );
}`,
    },
    {
      id: 7,
      type: "core",
      file_path: "app/(tabs)/groceries.tsx",
      highlight_lines: [5, 35],
      narration_text:
        "The groceries screen provides a robust interface for managing the user's pantry and inventory. Users can quickly add items, categorize them, and track quantities to receive low-stock alerts.",
      duration_seconds: 15,
      title: "Pantry & Inventory Management",
      code: `import { View, Text, FlatList, TextInput, Pressable } from 'react-native';
import { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { GroceryItem } from '@/components/GroceryItem';
import { CategoryFilter } from '@/components/CategoryFilter';
import { Plus, Search } from 'lucide-react-native';

export default function GroceriesScreen() {
  const { groceries, setGroceries } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const filteredGroceries = groceries.filter(item => {
    const matchesSearch = item.name
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesCategory = !selectedCategory || 
      item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const addGrocery = (name: string, category: string) => {
    const newItem = {
      id: Date.now().toString(),
      name,
      category,
      quantity: 1,
      addedAt: new Date(),
    };
    setGroceries([...groceries, newItem]);
  };

  return (
    <View className="flex-1 bg-background">
      {/* Search Bar */}
      <View className="flex-row items-center p-4 gap-2">
        <Search size={20} color="#888" />
        <TextInput
          placeholder="Search groceries..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          className="flex-1 text-foreground"
        />
      </View>

      {/* Category Filter */}
      <CategoryFilter
        selected={selectedCategory}
        onSelect={setSelectedCategory}
      />

      {/* Grocery List */}
      <FlatList
        data={filteredGroceries}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <GroceryItem item={item} onUpdate={updateGrocery} />
        )}
      />
    </View>
  );
}`,
    },
    {
      id: 8,
      type: "core",
      file_path: "src/components/AIRecipeGenerator.tsx",
      highlight_lines: [12, 50],
      narration_text:
        "The AIRecipeGenerator component provides the visual interface for triggering the Amazon Bedrock reasoning process. It displays engaging loading states and animations while the AI analyzes the user's pantry.",
      duration_seconds: 15,
      title: "AI Generation Interface",
      code: `import { View, Text, Pressable, Animated } from 'react-native';
import { useRef, useEffect } from 'react';
import { ChefHat, Sparkles, Loader2 } from 'lucide-react-native';

interface AIRecipeGeneratorProps {
  onGenerate: () => Promise<void>;
  isGenerating: boolean;
  groceryCount: number;
}

export function AIRecipeGenerator({
  onGenerate,
  isGenerating,
  groceryCount,
}: AIRecipeGeneratorProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isGenerating) {
      // Pulse animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      ).start();

      // Rotate animation
      Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        })
      ).start();
    }
  }, [isGenerating]);

  const rotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Pressable onPress={onGenerate} disabled={isGenerating || groceryCount === 0}>
      <Animated.View
        style={{ transform: [{ scale: pulseAnim }] }}
        className="bg-primary rounded-2xl p-6 items-center"
      >
        <Animated.View style={{ transform: [{ rotate: rotation }] }}>
          {isGenerating ? (
            <Loader2 size={48} color="white" />
          ) : (
            <ChefHat size={48} color="white" />
          )}
        </Animated.View>
        
        <Text className="text-white text-lg font-bold mt-4">
          {isGenerating ? 'Cooking up ideas...' : 'Generate Recipe'}
        </Text>
        
        <View className="flex-row items-center mt-2">
          <Sparkles size={16} color="white" />
          <Text className="text-white/80 ml-2">
            {groceryCount} ingredients available
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}`,
    },
    {
      id: 9,
      type: "core",
      file_path: "src/lib/bedrock.ts",
      highlight_lines: [20, 70],
      narration_text:
        "The bedrock.ts file handles low-level communication with the Amazon Bedrock API. It implements a custom AWS Signature V4 signing process to securely invoke the Amazon Titan Text models.",
      duration_seconds: 15,
      title: "AWS Bedrock Integration",
      code: `import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

const AWS_REGION = 'us-east-1';
const AWS_SERVICE = 'bedrock-runtime';
const MODEL_ID = 'amazon.titan-text-express-v1';

interface BedrockRequest {
  prompt: string;
  maxTokens?: number;
  temperature?: number;
}

export async function invokeModel(request: BedrockRequest): Promise<string> {
  const { prompt, maxTokens = 2048, temperature = 0.7 } = request;

  const endpoint = \`https://bedrock-runtime.\${AWS_REGION}.amazonaws.com\`;
  const path = \`/model/\${MODEL_ID}/invoke\`;
  
  const body = JSON.stringify({
    inputText: prompt,
    textGenerationConfig: {
      maxTokenCount: maxTokens,
      temperature,
      topP: 0.9,
    },
  });

  // Generate AWS Signature V4
  const timestamp = new Date().toISOString().replace(/[:-]|\\.\\d{3}/g, '');
  const date = timestamp.slice(0, 8);

  const canonicalRequest = createCanonicalRequest({
    method: 'POST',
    path,
    headers: {
      'content-type': 'application/json',
      host: new URL(endpoint).host,
      'x-amz-date': timestamp,
    },
    body,
  });

  const stringToSign = createStringToSign({
    timestamp,
    date,
    region: AWS_REGION,
    service: AWS_SERVICE,
    canonicalRequest,
  });

  const signature = calculateSignature({
    date,
    region: AWS_REGION,
    service: AWS_SERVICE,
    stringToSign,
  });

  const response = await fetch(\`\${endpoint}\${path}\`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Amz-Date': timestamp,
      'Authorization': buildAuthHeader(signature, date),
    },
    body,
  });

  if (!response.ok) {
    throw new Error(\`Bedrock API error: \${response.status}\`);
  }

  const data = await response.json();
  return data.results[0].outputText;
}`,
    },
    {
      id: 10,
      type: "core",
      file_path: "src/lib/bedrockService.ts",
      highlight_lines: [5, 40],
      narration_text:
        "The bedrockService provides a high-level API for the rest of the application to request recipes. It orchestrates the flow between the raw Bedrock API calls and the caching layer to optimize performance.",
      duration_seconds: 14,
      title: "Recipe Service Layer",
      code: `import { invokeModel } from './bedrock';
import { getFromCache, saveToCache } from './recipeCache';
import { generateRecipePrompt } from '@/prompts/generateRecipePrompt';
import { validateRecipe } from './recipeValidator';
import { Recipe, GenerateRecipeParams } from '@/types';

export async function generateRecipe(params: GenerateRecipeParams): Promise<Recipe> {
  const { groceries, mealSlot, preferences } = params;

  // Check cache first
  const cachedRecipe = await getFromCache(groceries, mealSlot, preferences);
  if (cachedRecipe) {
    console.log('Cache hit! Returning cached recipe');
    return cachedRecipe;
  }

  // Generate prompt
  const prompt = generateRecipePrompt({
    groceries: groceries.map(g => g.name),
    mealSlot,
    dietaryGoals: preferences.dietaryGoals,
    cookingLevel: preferences.cookingLevel,
    restrictions: preferences.restrictions,
  });

  // Invoke Bedrock
  const response = await invokeModel({
    prompt,
    maxTokens: 2048,
    temperature: 0.8,
  });

  // Parse and validate response
  const recipe = parseRecipeResponse(response);
  const validated = validateRecipe(recipe);

  // Save to cache
  await saveToCache(groceries, mealSlot, preferences, validated);

  return validated;
}

function parseRecipeResponse(response: string): Recipe {
  // Extract JSON from response
  const jsonMatch = response.match(/\\{[\\s\\S]*\\}/);
  if (!jsonMatch) {
    throw new Error('Failed to parse recipe response');
  }
  return JSON.parse(jsonMatch[0]);
}`,
    },
    {
      id: 11,
      type: "core",
      file_path: "src/lib/recipeCache.ts",
      highlight_lines: [10, 45],
      narration_text:
        "The recipeCache implements a sophisticated caching strategy using Firestore. It generates unique cache keys based on a deterministic hash of the user's current groceries and dietary preferences.",
      duration_seconds: 15,
      title: "Smart Caching System",
      code: `import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { Recipe, Grocery, MealSlot, UserPreferences } from '@/types';

const CACHE_COLLECTION = 'recipe_cache';
const CACHE_EXPIRY_DAYS = 7;

export function generateCacheKey(
  groceries: Grocery[],
  mealSlot: MealSlot,
  preferences: UserPreferences
): string {
  // Sort groceries alphabetically for consistent hashing
  const sortedGroceries = groceries
    .map(g => g.name.toLowerCase())
    .sort()
    .join(',');

  const keyString = [
    sortedGroceries,
    mealSlot,
    preferences.dietaryGoals.join(','),
    preferences.cookingLevel,
  ].join('|');

  // Generate SHA-256 hash
  const hash = sha256(new TextEncoder().encode(keyString));
  return bytesToHex(hash).slice(0, 16);
}

export async function getFromCache(
  groceries: Grocery[],
  mealSlot: MealSlot,
  preferences: UserPreferences
): Promise<Recipe | null> {
  const cacheKey = generateCacheKey(groceries, mealSlot, preferences);
  const docRef = doc(db, CACHE_COLLECTION, cacheKey);
  
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) return null;

  const data = snapshot.data();
  const createdAt = data.createdAt?.toDate();
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() - CACHE_EXPIRY_DAYS);

  // Check if cache is expired
  if (createdAt < expiryDate) {
    return null;
  }

  return data.recipe as Recipe;
}

export async function saveToCache(
  groceries: Grocery[],
  mealSlot: MealSlot,
  preferences: UserPreferences,
  recipe: Recipe
): Promise<void> {
  const cacheKey = generateCacheKey(groceries, mealSlot, preferences);
  const docRef = doc(db, CACHE_COLLECTION, cacheKey);

  await setDoc(docRef, {
    recipe,
    groceries: groceries.map(g => g.name),
    mealSlot,
    createdAt: new Date(),
  });
}`,
    },
    {
      id: 12,
      type: "support",
      file_path: "src/lib/firebase.ts",
      highlight_lines: [1, 25],
      narration_text:
        "The firebase.ts file initializes the connection to Google Firebase services, including Authentication and Firestore. It exports the auth and db instances used throughout the app.",
      duration_seconds: 14,
      title: "Firebase Configuration",
      code: `import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase only if not already initialized
const app = getApps().length === 0 
  ? initializeApp(firebaseConfig) 
  : getApps()[0];

// Initialize services
export const auth = getAuth(app);
export const db = getFirestore(app);

// Enable offline persistence for Firestore
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === 'failed-precondition') {
    console.warn('Firestore persistence unavailable (multiple tabs open)');
  } else if (err.code === 'unimplemented') {
    console.warn('Firestore persistence not supported');
  }
});

export default app;`,
    },
    {
      id: 13,
      type: "wrap_up",
      file_path: "README.md",
      highlight_lines: [50, 70],
      narration_text:
        "In summary, Sous Chef is a sophisticated example of an AI agent integrated into a modern mobile environment. By combining Amazon Bedrock with Firebase and a robust caching layer, it creates a seamless and cost-effective user experience.",
      duration_seconds: 15,
      title: "Architecture Summary & Wrap Up",
      code: `## Architecture Summary

### Core Components

\`\`\`
┌─────────────────────────────────────────────┐
│                Mobile App                    │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐     │
│  │  Home   │  │ Pantry  │  │ Recipes │     │
│  └────┬────┘  └────┬────┘  └────┬────┘     │
│       │            │            │           │
│       └────────────┼────────────┘           │
│                    ▼                        │
│           ┌──────────────┐                  │
│           │  AppContext  │                  │
│           └──────┬───────┘                  │
└──────────────────┼──────────────────────────┘
                   │
         ┌─────────┴─────────┐
         ▼                   ▼
┌──────────────┐    ┌──────────────┐
│   Firebase   │    │   Bedrock    │
│  (Storage)   │    │    (AI)      │
└──────────────┘    └──────────────┘
\`\`\`

### Key Takeaways

1. **Autonomous AI Agent** - Proactively suggests meals
2. **Smart Caching** - Reduces API costs by 60-80%
3. **Real-time Sync** - Firebase for instant updates
4. **Type Safety** - Full TypeScript coverage
5. **Modular Design** - Easy to extend and maintain

### Future Enhancements

- Voice-controlled cooking mode
- Multi-language support
- Social recipe sharing
- Nutrition tracking integration

---

Built with ❤️ for AWS AI Agent Global Hackathon 2025
`,
    },
  ],
};
