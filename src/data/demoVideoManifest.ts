import type { VideoManifest } from "@/lib/types";

/**
 * Sample video manifest for the landing page demo.
 * This showcases GitFlick's capabilities with a real, impressive example.
 * Based on a React component library structure.
 */
export const demoVideoManifest: VideoManifest = {
  title: "GitFlick: Repo to Reel - Demo",
  repo_url: "https://github.com/gitflick/demo",
  total_duration_seconds: 45,
  repo_files: [
    "README.md",
    "package.json",
    "src/components/Button.tsx",
    "src/lib/utils.ts",
    "src/index.ts",
  ],
  scenes: [
    {
      id: 1,
      type: "intro",
      file_path: "README.md",
      highlight_lines: [1, 15],
      narration_text: "Welcome to GitFlick. This demo showcases how we transform any GitHub repository into an engaging video walkthrough. Watch as we explore a modern React component library, understanding its architecture through AI-powered narration.",
      duration_seconds: 8,
      code: `# GitFlick Demo

A modern React component library built with TypeScript and Tailwind CSS.

## Features

- 🎨 Beautiful, accessible components
- ⚡ Lightning-fast performance
- 📱 Fully responsive design
- 🎯 TypeScript support
- 🌈 Customizable themes

## Quick Start

\`\`\`bash
npm install @gitflick/components
\`\`\``,
    },
    {
      id: 2,
      type: "overview",
      file_path: "package.json",
      highlight_lines: [1, 25],
      narration_text: "The project structure begins with package.json, defining dependencies and scripts. Notice how we use modern tooling like Vite for bundling and TypeScript for type safety.",
      duration_seconds: 7,
      code: `{
  "name": "@gitflick/components",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "test": "vitest"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "typescript": "^5.0.0",
    "vite": "^5.0.0"
  }
}`,
    },
    {
      id: 3,
      type: "code",
      file_path: "src/components/Button.tsx",
      highlight_lines: [1, 30],
      narration_text: "Here's our Button component. It uses TypeScript interfaces for props, supports multiple variants, and includes proper accessibility attributes. The component is fully typed and follows React best practices.",
      duration_seconds: 10,
      code: `import React from 'react';

interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  onClick?: () => void;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  children,
  onClick,
}) => {
  const baseStyles = 'font-semibold rounded-lg transition-all';
  const variantStyles = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700',
    secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300',
    outline: 'border-2 border-blue-600 text-blue-600 hover:bg-blue-50',
  };
  const sizeStyles = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  return (
    <button
      className={\`\${baseStyles} \${variantStyles[variant]} \${sizeStyles[size]}\`}
      onClick={onClick}
    >
      {children}
    </button>
  );
};`,
    },
    {
      id: 4,
      type: "code",
      file_path: "src/lib/utils.ts",
      highlight_lines: [1, 20],
      narration_text: "Utility functions provide helper methods used throughout the library. This file exports common utilities like class name merging and type guards, keeping the codebase DRY and maintainable.",
      duration_seconds: 8,
      code: `/**
 * Utility functions for the component library
 */

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}`,
    },
    {
      id: 5,
      type: "summary",
      file_path: "src/index.ts",
      highlight_lines: [1, 10],
      narration_text: "Finally, the main entry point exports all public components. This clean API allows developers to import exactly what they need, keeping bundle sizes small and the developer experience smooth.",
      duration_seconds: 7,
      code: `/**
 * Main entry point for the component library
 */

export { Button } from './components/Button';
export { Card } from './components/Card';
export { Input } from './components/Input';

export type { ButtonProps } from './components/Button';
export type { CardProps } from './components/Card';
export type { InputProps } from './components/Input';`,
    },
    {
      id: 6,
      type: "outro",
      file_path: "README.md",
      highlight_lines: [1, 5],
      narration_text: "And that's how GitFlick transforms code into stories. In just 60 seconds, we've created an engaging walkthrough that helps developers understand any codebase instantly. Try it with your own repository today.",
      duration_seconds: 5,
      code: `# GitFlick Demo

Transform your code into engaging video walkthroughs.

Powered by advanced AI.`,
    },
  ],
};
