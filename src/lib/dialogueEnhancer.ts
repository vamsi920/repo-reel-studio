import type {
  DialoguePersonality,
  StoryArcPhase,
  EnhancedDialogue,
  EmphasisMarker,
  PacingInstruction,
  AudienceLevel,
  VideoSceneType,
  TutorialPhase,
} from "@/lib/types";

// Personality-specific language patterns and tone
const PERSONALITY_TRAITS: Record<DialoguePersonality, {
  greeting: string[];
  transition: string[];
  emphasis: string[];
  conclusion: string[];
  tone: string;
  paceModifier: number;
}> = {
  friendly: {
    greeting: [
      "Hey there! Let's explore",
      "Welcome! Today we're diving into",
      "Hi! Ready to discover",
      "Great to have you here! Let's unpack",
    ],
    transition: [
      "Now, here's where it gets interesting...",
      "Let's take a closer look at",
      "Moving on to something cool",
      "Here's the fun part",
    ],
    emphasis: [
      "This is really important",
      "Pay special attention to",
      "Here's the key takeaway",
      "Remember this part",
    ],
    conclusion: [
      "And that's the story!",
      "Hope you enjoyed this journey",
      "You've got this now!",
      "Pretty cool, right?",
    ],
    tone: "conversational and warm",
    paceModifier: 1.0,
  },
  professional: {
    greeting: [
      "Welcome. In this video, we'll examine",
      "Let's begin our exploration of",
      "Today's focus is on",
      "We'll be analyzing",
    ],
    transition: [
      "Moving to our next topic",
      "Let's now examine",
      "Turning our attention to",
      "Consider the following",
    ],
    emphasis: [
      "It's crucial to understand",
      "This is a fundamental concept",
      "Note the significance of",
      "This principle is essential",
    ],
    conclusion: [
      "In summary",
      "To conclude our analysis",
      "We've covered the key aspects",
      "This completes our examination",
    ],
    tone: "clear and authoritative",
    paceModifier: 0.95,
  },
  casual: {
    greeting: [
      "What's up! So we're checking out",
      "Yo! Let's break down",
      "Alright, so here's",
      "Hey! Time to look at",
    ],
    transition: [
      "Okay, so check this out",
      "Now for the good stuff",
      "Here's where it gets wild",
      "Alright, moving on to",
    ],
    emphasis: [
      "This is huge",
      "Don't miss this",
      "Super important here",
      "This is the secret sauce",
    ],
    conclusion: [
      "And boom, that's it!",
      "That's all there is to it",
      "Easy, right?",
      "And we're done!",
    ],
    tone: "relaxed and energetic",
    paceModifier: 1.1,
  },
  technical: {
    greeting: [
      "Technical overview:",
      "Implementation details for",
      "Architecture analysis:",
      "System specification:",
    ],
    transition: [
      "Proceeding to implementation",
      "Technical consideration:",
      "Examining the codebase",
      "Architectural pattern:",
    ],
    emphasis: [
      "Critical implementation detail",
      "Performance consideration",
      "Security implication",
      "Architectural decision",
    ],
    conclusion: [
      "Implementation complete",
      "Technical summary",
      "Architecture reviewed",
      "Specification concluded",
    ],
    tone: "precise and detailed",
    paceModifier: 0.9,
  },
};

// Story arc templates for different phases
const STORY_ARC_TEMPLATES: Record<StoryArcPhase, {
  opening: string[];
  body: string[];
  closing: string[];
  pacingType: "slow" | "medium" | "fast";
}> = {
  hook: {
    opening: [
      "Have you ever wondered",
      "What if I told you",
      "Here's something fascinating",
      "Imagine being able to",
    ],
    body: [
      "This is exactly what we're about to explore",
      "That's the power we're unlocking today",
      "This changes everything about how we think",
      "And that's just the beginning",
    ],
    closing: [
      "Intrigued? Let's dive deeper",
      "Ready to see how? Let's go",
      "Excited? You should be",
      "Let's uncover the magic",
    ],
    pacingType: "medium",
  },
  exploration: {
    opening: [
      "Let's explore how this works",
      "Time to dig into the details",
      "Here's what's happening under the hood",
      "Let's break this down step by step",
    ],
    body: [
      "Notice how",
      "The key here is",
      "What's interesting is",
      "Pay attention to",
    ],
    closing: [
      "Now you see the pattern",
      "Starting to make sense?",
      "The pieces are coming together",
      "See how it all connects?",
    ],
    pacingType: "slow",
  },
  revelation: {
    opening: [
      "Here's the breakthrough moment",
      "This is where everything clicks",
      "The real insight is",
      "Now for the key revelation",
    ],
    body: [
      "This means that",
      "The implication is profound",
      "What this enables is",
      "This unlocks the ability to",
    ],
    closing: [
      "Mind-blowing, right?",
      "This changes our entire approach",
      "Now you understand the power",
      "The possibilities are endless",
    ],
    pacingType: "medium",
  },
  mastery: {
    opening: [
      "Now you're ready to master this",
      "Let's put it all into practice",
      "Time to apply what we've learned",
      "You now have the tools to",
    ],
    body: [
      "You can use this to",
      "Apply this pattern when",
      "Remember to always",
      "The best practice is",
    ],
    closing: [
      "You've got this mastered",
      "You're now equipped to",
      "Go forth and build",
      "The power is in your hands",
    ],
    pacingType: "fast",
  },
  conclusion: {
    opening: [
      "Let's recap what we've discovered",
      "To summarize our journey",
      "Here's what we've accomplished",
      "Looking back at what we've learned",
    ],
    body: [
      "We started by understanding",
      "Then we discovered",
      "We explored how",
      "Finally, we mastered",
    ],
    closing: [
      "Thanks for joining this journey",
      "Until next time",
      "Keep exploring and building",
      "Now go create something amazing",
    ],
    pacingType: "slow",
  },
};

// Technical term emphasis database
const TECHNICAL_TERMS = new Set([
  "API", "REST", "GraphQL", "database", "algorithm", "function", "class",
  "module", "component", "service", "repository", "authentication", "authorization",
  "encryption", "deployment", "container", "Docker", "Kubernetes", "microservice",
  "architecture", "pattern", "singleton", "factory", "observer", "dependency",
  "injection", "async", "await", "promise", "callback", "event", "handler",
  "middleware", "pipeline", "workflow", "CI/CD", "testing", "unit", "integration",
  "performance", "optimization", "cache", "memory", "CPU", "latency", "throughput",
]);

export function enhanceDialogue(
  rawText: string,
  personality: DialoguePersonality,
  storyPhase: StoryArcPhase,
  audienceLevel: AudienceLevel,
  sceneType?: VideoSceneType
): EnhancedDialogue {
  const traits = PERSONALITY_TRAITS[personality];
  const arcTemplate = STORY_ARC_TEMPLATES[storyPhase];
  
  // Apply personality-specific transformations
  let enhancedText = applyPersonalityTone(rawText, personality, storyPhase);
  
  // Add contextual transitions
  enhancedText = addTransitions(enhancedText, traits, arcTemplate);
  
  // Generate emphasis markers
  const emphasisMarkers = generateEmphasisMarkers(enhancedText, audienceLevel);
  
  // Generate pacing instructions
  const pacingInstructions = generatePacingInstructions(
    enhancedText,
    arcTemplate.pacingType,
    traits.paceModifier
  );
  
  // Extract contextual hints for better delivery
  const contextualHints = extractContextualHints(enhancedText, sceneType);
  
  return {
    text: enhancedText,
    personality,
    storyPhase,
    emphasis: emphasisMarkers,
    pacing: pacingInstructions,
    contextualHints,
  };
}

function applyPersonalityTone(
  text: string,
  personality: DialoguePersonality,
  phase: StoryArcPhase
): string {
  const traits = PERSONALITY_TRAITS[personality];
  const sentences = text.split(/(?<=[.!?])\s+/);
  
  // Apply opening transformation for first sentence if in hook phase
  if (phase === "hook" && sentences.length > 0) {
    const randomGreeting = traits.greeting[Math.floor(Math.random() * traits.greeting.length)];
    sentences[0] = `${randomGreeting} ${sentences[0].toLowerCase()}`;
  }
  
  // Apply personality-specific word replacements
  let enhancedText = sentences.join(" ");
  
  if (personality === "friendly") {
    enhancedText = enhancedText
      .replace(/\bIt is\b/g, "It's")
      .replace(/\bWe will\b/g, "We'll")
      .replace(/\bLet us\b/g, "Let's")
      .replace(/\bexamine\b/gi, "check out")
      .replace(/\bobserve\b/gi, "notice")
      .replace(/\bdemonstrate\b/gi, "show");
  } else if (personality === "casual") {
    enhancedText = enhancedText
      .replace(/\bfunctionality\b/gi, "feature")
      .replace(/\bimplement\b/gi, "build")
      .replace(/\butilize\b/gi, "use")
      .replace(/\bcomprehend\b/gi, "get")
      .replace(/\bsubstantial\b/gi, "big");
  } else if (personality === "technical") {
    enhancedText = enhancedText
      .replace(/\buse\b/gi, "utilize")
      .replace(/\bfast\b/gi, "performant")
      .replace(/\bslow\b/gi, "suboptimal")
      .replace(/\bfix\b/gi, "resolve")
      .replace(/\bbug\b/gi, "defect");
  }
  
  return enhancedText;
}

function addTransitions(
  text: string,
  traits: typeof PERSONALITY_TRAITS[DialoguePersonality],
  arcTemplate: typeof STORY_ARC_TEMPLATES[StoryArcPhase]
): string {
  const sentences = text.split(/(?<=[.!?])\s+/);
  
  if (sentences.length <= 1) return text;
  
  // Add transition phrases between major points
  const enhanced: string[] = [];
  sentences.forEach((sentence, idx) => {
    if (idx > 0 && idx % 3 === 0) {
      // Add transition every few sentences
      const transition = traits.transition[Math.floor(Math.random() * traits.transition.length)];
      enhanced.push(transition);
    }
    enhanced.push(sentence);
  });
  
  return enhanced.join(" ");
}

function generateEmphasisMarkers(
  text: string,
  audienceLevel: AudienceLevel
): EmphasisMarker[] {
  const markers: EmphasisMarker[] = [];
  const words = text.split(/\s+/);
  let currentPosition = 0;
  
  words.forEach((word) => {
    const cleanWord = word.replace(/[.,!?;:]/, "");
    
    // Emphasize technical terms for beginners
    if (audienceLevel === "beginner" && TECHNICAL_TERMS.has(cleanWord)) {
      markers.push({
        start: currentPosition,
        end: currentPosition + word.length,
        type: "slow-down",
        intensity: 0.8,
      });
    }
    
    // Emphasize important phrases
    if (word.match(/^(crucial|important|key|essential|critical|remember)/i)) {
      markers.push({
        start: currentPosition,
        end: currentPosition + word.length,
        type: "strong",
        intensity: 1.0,
      });
    }
    
    // Add pauses after questions
    if (word.endsWith("?")) {
      markers.push({
        start: currentPosition + word.length,
        end: currentPosition + word.length,
        type: "pause",
        intensity: 0.5,
      });
    }
    
    currentPosition += word.length + 1; // +1 for space
  });
  
  return markers;
}

function generatePacingInstructions(
  text: string,
  pacingType: "slow" | "medium" | "fast",
  paceModifier: number
): PacingInstruction[] {
  const instructions: PacingInstruction[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  let currentPosition = 0;
  
  const basePace = {
    slow: 0.9,
    medium: 1.0,
    fast: 1.1,
  };
  
  const pace = basePace[pacingType] * paceModifier;
  
  sentences.forEach((sentence, idx) => {
    // Add breathing room between sentences
    if (idx > 0) {
      instructions.push({
        position: currentPosition,
        type: "breathe",
        duration: 0.2 / pace,
      });
    }
    
    // Longer pauses for questions
    if (sentence.includes("?")) {
      instructions.push({
        position: currentPosition + sentence.length,
        type: "pause",
        duration: 0.5 / pace,
      });
    }
    
    // Speed variations for lists
    if (sentence.includes(",")) {
      const commaPos = currentPosition + sentence.indexOf(",");
      instructions.push({
        position: commaPos,
        type: "accelerate",
        duration: 0.1,
      });
    }
    
    // Slow down for emphasis
    if (sentence.match(/(important|crucial|key|remember)/i)) {
      instructions.push({
        position: currentPosition,
        type: "decelerate",
        duration: 0.3,
      });
    }
    
    currentPosition += sentence.length + 1;
  });
  
  return instructions;
}

function extractContextualHints(
  text: string,
  sceneType?: VideoSceneType
): string[] {
  const hints: string[] = [];
  
  // Scene-specific hints
  if (sceneType === "intro") {
    hints.push("Welcoming tone");
    hints.push("Build excitement");
  } else if (sceneType === "code") {
    hints.push("Technical precision");
    hints.push("Clear articulation");
  } else if (sceneType === "summary") {
    hints.push("Confident delivery");
    hints.push("Reinforce key points");
  }
  
  // Content-based hints
  if (text.includes("?")) {
    hints.push("Rhetorical question - pause for effect");
  }
  
  if (text.match(/first|second|third|finally/i)) {
    hints.push("Enumeration - clear separation");
  }
  
  if (text.match(/imagine|picture|visualize/i)) {
    hints.push("Descriptive - paint a picture");
  }
  
  if (text.match(/remember|important|crucial/i)) {
    hints.push("Emphasis needed");
  }
  
  return hints;
}

// Batch enhancement for multiple scenes
export function enhanceVideoManifestDialogue(
  scenes: Array<{
    narration: string;
    type: VideoSceneType;
    phase: TutorialPhase;
  }>,
  personality: DialoguePersonality,
  audienceLevel: AudienceLevel
): EnhancedDialogue[] {
  const storyArcMapping: Record<TutorialPhase, StoryArcPhase> = {
    hook: "hook",
    architecture: "exploration",
    flow: "exploration",
    deep_dive: "revelation",
    details: "mastery",
    conclusion: "conclusion",
  };
  
  return scenes.map((scene) => {
    const storyPhase = storyArcMapping[scene.phase] || "exploration";
    return enhanceDialogue(
      scene.narration,
      personality,
      storyPhase,
      audienceLevel,
      scene.type
    );
  });
}

// Utility to preview enhanced dialogue with markup
export function previewEnhancedDialogue(dialogue: EnhancedDialogue): string {
  let preview = dialogue.text;
  
  // Add emphasis markers as HTML-like tags
  dialogue.emphasis.forEach((marker) => {
    const before = preview.substring(0, marker.start);
    const emphasized = preview.substring(marker.start, marker.end);
    const after = preview.substring(marker.end);
    
    const tag = marker.type === "strong" ? "**" :
                marker.type === "pause" ? "[pause]" :
                marker.type === "slow-down" ? "<<" :
                ">";
    
    preview = `${before}${tag}${emphasized}${tag}${after}`;
  });
  
  // Add pacing instructions as comments
  dialogue.pacing.forEach((instruction) => {
    const before = preview.substring(0, instruction.position);
    const after = preview.substring(instruction.position);
    preview = `${before} /*${instruction.type}:${instruction.duration}s*/ ${after}`;
  });
  
  return preview;
}

// Generate personality-appropriate chapter titles
export function enhanceChapterTitle(
  title: string,
  personality: DialoguePersonality
): string {
  switch (personality) {
    case "friendly":
      return title.replace(/^/, "Let's explore: ");
    case "casual":
      return title.replace(/Deep Dive/i, "Diving into").replace(/Overview/i, "Quick look at");
    case "technical":
      return title.replace(/Getting Started/i, "Initial Setup & Configuration");
    case "professional":
    default:
      return title;
  }
}