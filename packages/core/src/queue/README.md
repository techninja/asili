# Asili Queue System

The queue system manages sequential execution of genomic risk calculations to prevent memory overload and provide better user experience.

## Core Components

### QueueManager (`@asili/core/queue`)

- Manages sequential processing of trait calculations
- Provides priority-based ordering
- Tracks progress and estimates completion times
- Emits events for UI updates

### TimeEstimator

- Records historical processing times
- Provides estimates based on trait complexity and variant count
- Adapts estimates based on actual performance

### Frontend Components

#### QueueControl (`queue-control.js`)

- Floating widget showing queue status
- Start/pause/stop controls
- Real-time progress and CPU/memory charts
- Queue management interface

#### Updated RiskDashboard

- Shows queue position instead of direct calculate buttons
- "Queue All" button to add all traits for an individual
- Integration with queue status display

## Usage

```javascript
import { QueueManager, QUEUE_PRIORITY } from '@asili/core';

// Initialize with processor
const queueManager = new QueueManager(processor);

// Add items to queue
queueManager.add('MONDO_0005147', 'individual_123', QUEUE_PRIORITY.HIGH);

// Start processing
queueManager.start();

// Subscribe to events
queueManager.subscribe(event => {
  console.log('Queue event:', event.event, event.data);
});
```

## Features

- **Sequential Processing**: Prevents memory overload by processing one trait at a time
- **Priority System**: Urgent, High, Normal, Low priority levels
- **Time Estimation**: Smart estimates based on historical data and variant counts
- **Progress Tracking**: Real-time progress updates with detailed status
- **Queue Management**: Add, remove, reorder, pause/resume functionality
- **Visual Interface**: Floating control widget with expandable details
- **Auto-Queue**: "Queue All" button to process all available traits
- **Persistence**: Queue state survives page refreshes (future enhancement)

## Queue States

- `PENDING`: Waiting to be processed
- `PROCESSING`: Currently being calculated
- `COMPLETED`: Successfully finished
- `FAILED`: Error during processing
- `PAUSED`: Queue is paused

## Events

- `added`: Item added to queue
- `removed`: Item removed from queue
- `prioritized`: Item moved to higher priority
- `started`: Queue processing started
- `paused`: Queue processing paused
- `resumed`: Queue processing resumed
- `stopped`: Queue processing stopped
- `processing`: Item started processing
- `progress`: Progress update for current item
- `itemCompleted`: Item finished successfully
- `itemFailed`: Item failed with error
- `completed`: All items processed
- `cleared`: Queue cleared
