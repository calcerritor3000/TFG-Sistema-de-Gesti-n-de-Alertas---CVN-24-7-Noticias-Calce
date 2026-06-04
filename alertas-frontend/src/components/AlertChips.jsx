import React from 'react';
import {
  getCategoryColor,
  getCategoryEmoji,
  getCategoryLabel,
  getLevelColor,
  getLevelEmoji,
  getLevelLabelText
} from '../alertVisuals';

export function LevelChip({ level, style }) {
  return (
    <span
      title={getLevelLabelText(level)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 26,
        height: 26,
        fontSize: 18,
        lineHeight: 1,
        ...style
      }}
    >
      {getLevelEmoji(level)}
    </span>
  );
}

export function CategoryBrief({ categoria, style }) {
  const key = String(categoria || 'otro').toLowerCase();
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, ...style }}>
      <span
        title={getCategoryLabel(key)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 26,
          height: 26,
          borderRadius: '50%',
          fontSize: 14,
          background: getCategoryColor(key),
          border: '2px solid #fff',
          boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
          flexShrink: 0
        }}
      >
        {getCategoryEmoji(key)}
      </span>
      <span style={{ textTransform: 'none' }}>{getCategoryLabel(key)}</span>
    </span>
  );
}
