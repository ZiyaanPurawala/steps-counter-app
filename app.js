// GeoPace - Premium Step & Calorie GPS Tracker Logic

// State management
let state = {
    isTracking: false,
    isPaused: false,
    startTime: null,
    elapsedTime: 0, // in seconds
    timerInterval: null,
    
    // Tracking metrics
    distance: 0, // in meters
    steps: 0,
    calories: 0,
    currentSpeed: 0, // in km/h
    avgSpeed: 0, // in km/h
    coordinates: [], // array of [lat, lng]
    
    // GPS status
    watchId: null,
    lastPosition: null,
    gpsAccuracy: null,

    // Audio status
    audioEnabled: true,
    speechSynthesis: window.speechSynthesis,
    
    // Simulation state
    isSimulating: false,
    simInterval: null,
    simLat: 40.7829, // default NY Central park
    simLng: -73.9654,
    simHeading: 0.8, // Radian angle direction
    
    // User profile settings (loaded from localStorage or defaults)
    profile: {
        weight: 75, // kg
        height: 175, // cm
        autoStep: true,
        stepLength: 72.6, // cm (height * 0.415)
        dailyGoal: 10000 // steps
    },
    
    // Interactive Weight Loss Planner values
    planner: {
        targetLoss: 1.0, // kg
        dailyWalkMins: 60 // mins
    },
    
    // History logs
    history: []
};

// Leaflet Map instance
let map = null;
let pathPolyline = null;
let userMarker = null;
let startMarker = null;

// Audio coaching voice
function speak(text) {
    if (!state.audioEnabled || !state.speechSynthesis) return;
    state.speechSynthesis.cancel(); // Stop active speaking
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    state.speechSynthesis.speak(utterance);
}

// Math Utility: Calculate distance between coordinates in meters (Haversine formula)
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// MET mapping based on speed (km/h)
function getMETFromSpeed(speedKmH) {
    if (speedKmH <= 0.1) return 0;
    if (speedKmH < 2.0) return 1.5; // very slow stroll
    if (speedKmH < 3.2) return 2.0; // slow walk
    if (speedKmH < 4.5) return 3.0; // moderate walk
    if (speedKmH < 5.6) return 3.5; // active brisk walk (typical default)
    if (speedKmH < 6.4) return 4.3; // fast walk
    if (speedKmH < 8.0) return 5.0; // very fast speed walk
    if (speedKmH < 9.6) return 8.3; // jog
    return 9.8; // running
}

// Page Elements
const elements = {
    gpsDot: document.querySelector('#gps-status-indicator .status-dot'),
    gpsText: document.getElementById('gps-status-text'),
    workoutBadge: document.getElementById('workout-badge'),
    
    // Main Display
    stepsVal: document.getElementById('main-steps-val'),
    distanceVal: document.getElementById('main-distance-val'),
    caloriesVal: document.getElementById('main-calories-val'),
    timeVal: document.getElementById('main-time-val'),
    speedVal: document.getElementById('speed-val'),
    paceVal: document.getElementById('pace-val'),
    stepsProgressCircle: document.getElementById('steps-progress-circle'),
    
    // Controls
    startBtn: document.getElementById('start-btn'),
    trackingControls: document.getElementById('tracking-controls'),
    pauseBtn: document.getElementById('pause-btn'),
    stopBtn: document.getElementById('stop-btn'),
    simulateBtn: document.getElementById('simulate-btn'),
    mapLocateBtn: document.getElementById('map-locate-btn'),
    mapFallback: document.getElementById('map-fallback'),
    audioToggleBtn: document.getElementById('audio-toggle-btn'),
    
    // Weight Loss Estimator
    targetLossSlider: document.getElementById('target-loss-slider'),
    targetLossVal: document.getElementById('target-loss-val'),
    dailyDurationSlider: document.getElementById('daily-duration-slider'),
    dailyDurationVal: document.getElementById('daily-duration-val'),
    estCalories: document.getElementById('est-calories'),
    estSteps: document.getElementById('est-steps'),
    estDistance: document.getElementById('est-distance'),
    estHours: document.getElementById('est-hours'),
    estDays: document.getElementById('est-days'),
    
    // Settings Drawer
    settingsToggleBtn: document.getElementById('settings-toggle-btn'),
    settingsCloseBtn: document.getElementById('settings-close-btn'),
    settingsDrawer: document.getElementById('settings-drawer'),
    settingsOverlay: document.getElementById('settings-overlay'),
    settingsForm: document.getElementById('settings-form'),
    weightInput: document.getElementById('profile-weight'),
    heightInput: document.getElementById('profile-height'),
    stepLengthInput: document.getElementById('profile-steplength'),
    autoStepCheckbox: document.getElementById('profile-auto-step'),
    dailyGoalInput: document.getElementById('profile-daily-goal'),
    
    // History
    historyContainer: document.getElementById('history-list-container'),
    clearHistoryBtn: document.getElementById('clear-history-btn'),
    
    // Sharing Exporter
    shareLastBtn: document.getElementById('share-last-btn'),
    shareModal: document.getElementById('share-modal'),
    shareCloseBtn: document.getElementById('share-close-btn'),
    shareOverlay: document.getElementById('share-overlay'),
    shareNativeBtn: document.getElementById('share-native-btn'),
    shareDownloadBtn: document.getElementById('share-download-btn'),
    shareDate: document.getElementById('share-date'),
    shareSteps: document.getElementById('share-steps'),
    shareDistance: document.getElementById('share-distance'),
    shareCalories: document.getElementById('share-calories'),
    shareDuration: document.getElementById('share-duration'),
    shareSvgPath: document.getElementById('share-svg-path'),
    shareSvgStart: document.getElementById('share-svg-start'),
    shareSvgEnd: document.getElementById('share-svg-end'),
    shareNoRoute: document.getElementById('share-no-route')
};

// Initialize Application
document.addEventListener("DOMContentLoaded", () => {
    loadSettings();
    initMap();
    setupEventHandlers();
    updateDashboard();
    updateWeightLossEstimates();
    renderHistory();
    
    // Request initial coordinate location to lock map centering
    getCurrentLocation();
});

// Load Settings from LocalStorage
function loadSettings() {
    const savedProfile = localStorage.getItem("geopace_profile");
    if (savedProfile) {
        state.profile = JSON.parse(savedProfile);
    } else {
        // Compute default step length
        state.profile.stepLength = parseFloat((state.profile.height * 0.415).toFixed(1));
    }
    
    const savedHistory = localStorage.getItem("geopace_history");
    if (savedHistory) {
        state.history = JSON.parse(savedHistory);
    }
    
    const savedAudio = localStorage.getItem("geopace_audio_enabled");
    if (savedAudio !== null) {
        state.audioEnabled = savedAudio === "true";
    }
    
    const savedPlanner = localStorage.getItem("geopace_planner");
    if (savedPlanner) {
        state.planner = JSON.parse(savedPlanner);
    }
    
    // Sync to Form UI
    elements.weightInput.value = state.profile.weight;
    elements.heightInput.value = state.profile.height;
    elements.autoStepCheckbox.checked = state.profile.autoStep;
    elements.stepLengthInput.value = state.profile.stepLength;
    elements.stepLengthInput.disabled = state.profile.autoStep;
    elements.dailyGoalInput.value = state.profile.dailyGoal;
    
    // Sync to Planner UI
    elements.targetLossSlider.value = state.planner.targetLoss;
    elements.targetLossVal.innerText = state.planner.targetLoss.toFixed(1);
    elements.dailyDurationSlider.value = state.planner.dailyWalkMins;
    elements.dailyDurationVal.innerText = state.planner.dailyWalkMins;
    
    // Update audio toggle state class
    updateAudioButtonUI();
}

function updateAudioButtonUI() {
    if (state.audioEnabled) {
        elements.audioToggleBtn.classList.remove("muted");
        elements.audioToggleBtn.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
    } else {
        elements.audioToggleBtn.classList.add("muted");
        elements.audioToggleBtn.innerHTML = '<i class="fa-solid fa-volume-xmark"></i>';
    }
}

// Setup Event Listeners
function setupEventHandlers() {
    // Tracking Control click triggers
    elements.startBtn.addEventListener("click", startTracking);
    elements.pauseBtn.addEventListener("click", togglePause);
    elements.stopBtn.addEventListener("click", stopTracking);
    elements.simulateBtn.addEventListener("click", toggleSimulation);
    elements.mapLocateBtn.addEventListener("click", centerMapOnUser);
    
    // Settings Drawer toggling
    elements.settingsToggleBtn.addEventListener("click", () => state.isTracking ? alert("Please pause or stop tracking to change settings!") : openSettings());
    elements.settingsCloseBtn.addEventListener("click", closeSettings);
    elements.settingsOverlay.addEventListener("click", closeSettings);
    elements.settingsForm.addEventListener("submit", saveSettings);
    
    // Auto-step length checkbox handler
    elements.autoStepCheckbox.addEventListener("change", (e) => {
        elements.stepLengthInput.disabled = e.target.checked;
        if (e.target.checked) {
            const calculatedStep = parseFloat((elements.heightInput.value * 0.415).toFixed(1));
            elements.stepLengthInput.value = calculatedStep;
        }
    });
    
    elements.heightInput.addEventListener("input", () => {
        if (elements.autoStepCheckbox.checked) {
            const calculatedStep = parseFloat((elements.heightInput.value * 0.415).toFixed(1));
            elements.stepLengthInput.value = calculatedStep;
        }
    });
    
    // Weight Loss Goal Inputs
    elements.targetLossSlider.addEventListener("input", (e) => {
        state.planner.targetLoss = parseFloat(e.target.value);
        elements.targetLossVal.innerText = state.planner.targetLoss.toFixed(1);
        updateWeightLossEstimates();
        localStorage.setItem("geopace_planner", JSON.stringify(state.planner));
    });
    
    elements.dailyDurationSlider.addEventListener("input", (e) => {
        state.planner.dailyWalkMins = parseInt(e.target.value);
        elements.dailyDurationVal.innerText = state.planner.dailyWalkMins;
        updateWeightLossEstimates();
        localStorage.setItem("geopace_planner", JSON.stringify(state.planner));
    });
    
    // Audio toggling
    elements.audioToggleBtn.addEventListener("click", () => {
        state.audioEnabled = !state.audioEnabled;
        localStorage.setItem("geopace_audio_enabled", state.audioEnabled);
        updateAudioButtonUI();
        speak(state.audioEnabled ? "Audio coaching enabled" : "");
    });
    
    // Clear history
    elements.clearHistoryBtn.addEventListener("click", clearHistory);
    
    // Sharing Exporter Listeners
    elements.shareLastBtn.addEventListener("click", () => {
        if (state.lastWorkout) {
            openShareModal(state.lastWorkout);
        }
    });
    elements.shareCloseBtn.addEventListener("click", closeShareModal);
    elements.shareOverlay.addEventListener("click", closeShareModal);
    elements.shareNativeBtn.addEventListener("click", shareNative);
    elements.shareDownloadBtn.addEventListener("click", shareDownload);
}

// Map initialization using Leaflet
function initMap() {
    try {
        // Fallback placeholder coordinates: New York
        const initialCoords = [40.7829, -73.9654];
        
        map = L.map('map', {
            zoomControl: true,
            attributionControl: false
        }).setView(initialCoords, 15);
        
        // Dark theme map layer from CartoDB (perfect for sleek glowing aesthetics)
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 20
        }).addTo(map);
        
        // Define Custom Glowing Pulsing User Marker Icon
        const userIcon = L.divIcon({
            className: 'custom-map-marker-pulse',
            html: '<div class="marker-dot"></div><div class="marker-ring"></div>',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });

        // Initialize paths
        pathPolyline = L.polyline([], {
            color: '#00f2fe',
            weight: 6,
            opacity: 0.9,
            lineCap: 'round',
            lineJoin: 'round',
            shadowColor: 'rgba(0, 242, 254, 0.4)',
            shadowBlur: 10
        }).addTo(map);
        
        userMarker = L.marker(initialCoords, { icon: userIcon }).addTo(map);
        
        // Add custom styles for the map marker
        const style = document.createElement('style');
        style.textContent = `
            .custom-map-marker-pulse {
                position: relative;
                width: 24px;
                height: 24px;
            }
            .marker-dot {
                background: #00f2fe;
                width: 12px;
                height: 12px;
                border-radius: 50%;
                position: absolute;
                top: 6px;
                left: 6px;
                border: 2px solid white;
                box-shadow: 0 0 10px #00f2fe;
                z-index: 2;
            }
            .marker-ring {
                border: 3px solid rgba(0, 242, 254, 0.6);
                border-radius: 50%;
                height: 24px;
                width: 24px;
                position: absolute;
                top: 0;
                left: 0;
                animation: mapMarkerRingPulse 1.8s ease-out infinite;
                z-index: 1;
            }
            @keyframes mapMarkerRingPulse {
                0% { transform: scale(0.6); opacity: 1; }
                100% { transform: scale(1.6); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
        
    } catch (e) {
        console.error("Leaflet map initialization failed", e);
        elements.mapFallback.classList.remove("hidden");
    }
}

// Get user's current GPS location to center map initial view
function getCurrentLocation() {
    if (!navigator.geolocation) {
        console.warn("Geolocation not supported");
        return;
    }
    
    updateGpsIndicator("searching", "Acquiring GPS...");
    
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude, accuracy } = position.coords;
            state.gpsAccuracy = accuracy;
            
            updateGpsIndicator("online", `GPS Connected (${Math.round(accuracy)}m)`);
            
            const coords = [latitude, longitude];
            state.simLat = latitude; // Sync simulation start point to true location
            state.simLng = longitude;
            
            if (map) {
                map.setView(coords, 16);
                userMarker.setLatLng(coords);
            }
            elements.mapFallback.classList.add("hidden");
        },
        (error) => {
            console.warn("Geolocation error", error);
            updateGpsIndicator("offline", "GPS Offline / Permissions denied");
        },
        { enableHighAccuracy: true, timeout: 8000 }
    );
}

// Center Map view on Active User position
function centerMapOnUser() {
    let targetCoords = null;
    if (state.isSimulating) {
        targetCoords = [state.simLat, state.simLng];
    } else if (state.coordinates.length > 0) {
        targetCoords = state.coordinates[state.coordinates.length - 1];
    } else if (userMarker) {
        targetCoords = userMarker.getLatLng();
    }
    
    if (targetCoords && map) {
        map.setView(targetCoords, 17);
    }
}

// Update GPS Dot and Info Text UI
function updateGpsIndicator(status, message) {
    elements.gpsDot.className = "status-dot " + status;
    elements.gpsText.innerText = message;
}

// Drawer toggle operations
function openSettings() {
    elements.settingsDrawer.classList.add("active");
}

function closeSettings() {
    elements.settingsDrawer.classList.remove("active");
}

// Save User Profile settings from drawer
function saveSettings(e) {
    e.preventDefault();
    
    state.profile.weight = parseFloat(elements.weightInput.value);
    state.profile.height = parseFloat(elements.heightInput.value);
    state.profile.autoStep = elements.autoStepCheckbox.checked;
    state.profile.stepLength = parseFloat(elements.stepLengthInput.value);
    state.profile.dailyGoal = parseInt(elements.dailyGoalInput.value);
    
    localStorage.setItem("geopace_profile", JSON.stringify(state.profile));
    
    closeSettings();
    updateDashboard();
    updateWeightLossEstimates();
    
    speak("Profile settings saved successfully");
}

// Weight Loss Goals Predictor Engine
function updateWeightLossEstimates() {
    const targetKg = state.planner.targetLoss;
    const dailyMins = state.planner.dailyWalkMins;
    
    // Fat calorie density equivalent calculation (1kg fat = 7700 kcal)
    const targetKcal = targetKg * 7700;
    
    // Choose tracking speed or fall back to baseline average walking pace (4.8 km/h)
    let estimateSpeed = 4.8;
    if (state.isTracking && state.elapsedTime > 30 && state.avgSpeed > 1) {
        estimateSpeed = state.avgSpeed;
    } else if (state.history.length > 0) {
        // Average speed of last 3 tracks
        const recentRuns = state.history.slice(0, 3);
        const speedSum = recentRuns.reduce((sum, run) => sum + parseFloat(run.avgSpeed || 4.8), 0);
        estimateSpeed = speedSum / recentRuns.length;
    }
    
    // Determine MET scale relative to average speed
    const currentMET = getMETFromSpeed(estimateSpeed);
    const weightKg = state.profile.weight;
    
    // Hourly rate of calorie combustion = MET * weight
    const kcalPerHour = currentMET * weightKg;
    
    // Calc times
    const hoursNeeded = kcalPerHour > 0 ? (targetKcal / kcalPerHour) : 0;
    const minutesNeeded = hoursNeeded * 60;
    const daysNeeded = dailyMins > 0 ? (minutesNeeded / dailyMins) : 0;
    
    // Required Distance = speed (km/h) * hours
    const distanceRequired = estimateSpeed * hoursNeeded;
    
    // Required Steps = distance (meters) / stepLength (meters)
    const stepLengthMeters = state.profile.stepLength / 100;
    const stepsRequired = (distanceRequired * 1000) / stepLengthMeters;
    
    // Update Planner Outputs Panel UI
    elements.estCalories.innerText = Math.round(targetKcal).toLocaleString();
    elements.estSteps.innerText = Math.round(stepsRequired).toLocaleString();
    elements.estDistance.innerText = distanceRequired.toFixed(1) + " km";
    elements.estHours.innerText = hoursNeeded.toFixed(1) + " hours";
    
    // Display human friendly days
    if (daysNeeded < 1) {
        elements.estDays.innerText = "Under a day";
    } else {
        elements.estDays.innerText = daysNeeded.toFixed(1) + " days";
    }
}

// Start tracking GPS coordinates
function startTracking() {
    if (state.isTracking) return;
    
    state.isTracking = true;
    state.isPaused = false;
    state.startTime = Date.now() - (state.elapsedTime * 1000);
    
    // Show active items
    elements.startBtn.classList.add("hidden");
    elements.trackingControls.classList.remove("hidden");
    elements.workoutBadge.classList.remove("hidden");
    elements.pauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i> Pause';
    elements.pauseBtn.className = "btn btn-warning";
    
    // Speak coaching message
    speak("Workout tracking started. Stay safe and active!");
    
    // Reset temporary states if we are starting a completely new run (not resuming)
    if (state.elapsedTime === 0) {
        state.distance = 0;
        state.steps = 0;
        state.calories = 0;
        state.currentSpeed = 0;
        state.avgSpeed = 0;
        state.coordinates = [];
        state.lastPosition = null;
        
        if (pathPolyline) pathPolyline.setLatLngs([]);
        if (startMarker) {
            map.removeLayer(startMarker);
            startMarker = null;
        }
        
        updateDashboard();
    }
    
    // Start stopwatch interval
    state.timerInterval = setInterval(() => {
        state.elapsedTime = Math.floor((Date.now() - state.startTime) / 1000);
        updateDashboard();
        
        // Speak coaching updates on milestone steps
        if (state.steps > 0 && state.steps % 500 === 0) {
            speak(`Great job! You have reached ${state.steps} steps.`);
        }
    }, 1000);
    
    // Start GPS Watch Listener (if not simulating)
    if (!state.isSimulating) {
        if (!navigator.geolocation) {
            alert("Your browser does not support Geolocation tracking. Use Simulated Mode to test tracker.");
            stopTracking();
            return;
        }
        
        updateGpsIndicator("searching", "Searching GPS signal...");
        
        state.watchId = navigator.geolocation.watchPosition(
            handleGpsPositionUpdate,
            handleGpsTrackingError,
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    }
}

// Toggle Tracking Pause state
function togglePause() {
    if (!state.isTracking) return;
    
    if (state.isPaused) {
        // Resume Tracking
        state.isPaused = false;
        state.startTime = Date.now() - (state.elapsedTime * 1000);
        
        elements.pauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i> Pause';
        elements.pauseBtn.className = "btn btn-warning";
        
        speak("Workout tracking resumed");
        
        // Restart timer interval
        state.timerInterval = setInterval(() => {
            state.elapsedTime = Math.floor((Date.now() - state.startTime) / 1000);
            updateDashboard();
        }, 1000);
        
        // Resume coordinates logging
        if (state.isSimulating) {
            startSimulationTimer();
        } else {
            state.watchId = navigator.geolocation.watchPosition(
                handleGpsPositionUpdate,
                handleGpsTrackingError,
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        }
    } else {
        // Pause Tracking
        state.isPaused = true;
        
        // Stop time counting
        clearInterval(state.timerInterval);
        state.timerInterval = null;
        
        // Stop GPS watching
        if (state.isSimulating) {
            clearInterval(state.simInterval);
            state.simInterval = null;
        } else {
            if (state.watchId) {
                navigator.geolocation.clearWatch(state.watchId);
                state.watchId = null;
            }
        }
        
        elements.pauseBtn.innerHTML = '<i class="fa-solid fa-play"></i> Resume';
        elements.pauseBtn.className = "btn btn-primary";
        
        speak("Workout paused");
        updateGpsIndicator("searching", "Tracking paused");
    }
}

// Stop Tracking, save statistics into local workout log list
function stopTracking() {
    if (!state.isTracking) return;
    
    // Speak coaching
    speak(`Workout completed! You completed ${state.steps} steps and burned ${Math.round(state.calories)} calories.`);
    
    // Clear intervals
    clearInterval(state.timerInterval);
    state.timerInterval = null;
    
    if (state.isSimulating) {
        clearInterval(state.simInterval);
        state.simInterval = null;
    } else {
        if (state.watchId) {
            navigator.geolocation.clearWatch(state.watchId);
            state.watchId = null;
        }
    }
    
    // Save workout to log history
    if (state.steps > 5 || state.distance > 5) {
        const workoutLog = {
            id: Date.now(),
            date: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
            steps: state.steps,
            distance: (state.distance / 1000).toFixed(2), // in km
            calories: Math.round(state.calories),
            duration: formatDuration(state.elapsedTime),
            avgSpeed: state.avgSpeed.toFixed(1),
            coordinates: [...state.coordinates] // Store coordinates path for route sharing
        };
        
        state.lastWorkout = workoutLog;
        elements.shareLastBtn.classList.remove("hidden");
        
        state.history.unshift(workoutLog);
        localStorage.setItem("geopace_history", JSON.stringify(state.history));
        renderHistory();
    } else if (state.steps > 0) {
        alert("Workout distance too short to log in history.");
    }
    
    // Reset tracker panel
    state.isTracking = false;
    state.isPaused = false;
    state.elapsedTime = 0;
    
    elements.startBtn.classList.remove("hidden");
    elements.trackingControls.classList.add("hidden");
    elements.workoutBadge.classList.add("hidden");
    
    updateDashboard();
    updateWeightLossEstimates();
    
    if (state.isSimulating) {
        state.isSimulating = false;
        elements.simulateBtn.classList.remove("btn-primary");
        elements.simulateBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Sim Walk';
    }
    
    // Reset Map indicators
    updateGpsIndicator("online", "GPS Online");
}

// Callback handling GPS incoming coordinate update positions
function handleGpsPositionUpdate(position) {
    const { latitude, longitude, accuracy } = position.coords;
    state.gpsAccuracy = accuracy;
    
    // Skip coordinates with poor resolution metrics to prevent walking distance jitter anomalies
    if (accuracy > 25) {
        updateGpsIndicator("searching", `Filtering Jitter (${Math.round(accuracy)}m)`);
        return;
    }
    
    updateGpsIndicator("online", `GPS Connected (${Math.round(accuracy)}m)`);
    
    processPositionChange(latitude, longitude);
}

// Handle position coordinate analysis (used both by GPS watch and Mock walk simulators)
function processPositionChange(lat, lng) {
    const currentCoords = [lat, lng];
    
    if (state.lastPosition) {
        const lastLat = state.lastPosition[0];
        const lastLng = state.lastPosition[1];
        
        // Calculate coordinate incremental delta
        const deltaDistance = haversineDistance(lastLat, lastLng, lat, lng);
        
        // If movement is above 0.5 meters (ignores absolute static micro-movements)
        if (deltaDistance > 0.6) {
            state.distance += deltaDistance;
            
            // Estimate steps = distance / stepLength
            const stepLengthMeters = state.profile.stepLength / 100;
            state.steps = Math.round(state.distance / stepLengthMeters);
            
            // Calculate current speed: distance in km / time in hr
            // In short, speed (km/h) = deltaDistance (m) / 1000 / (1 sec / 3600)
            const speedKmh = deltaDistance * 3.6; 
            state.currentSpeed = Math.min(speedKmh, 20); // Cap human walking/running max speed at 20km/h
            
            // Estimate Calorie burns utilizing Metabolic Equivalents (METs)
            const currentMET = getMETFromSpeed(state.currentSpeed);
            const weightKg = state.profile.weight;
            
            // Incremental calorie burn = MET * Weight * TimeHours
            const incrementHours = 1 / 3600; // Updated every 1 second
            state.calories += currentMET * weightKg * incrementHours;
            
            state.coordinates.push(currentCoords);
            
            // Update polyline track and user spot marker in map frame
            if (pathPolyline) pathPolyline.setLatLngs(state.coordinates);
            
            // Draw starting point flag if first track step
            if (state.coordinates.length === 1 && map) {
                startMarker = L.circleMarker(currentCoords, {
                    radius: 7,
                    color: '#10b981',
                    fillColor: '#10b981',
                    fillOpacity: 1
                }).addTo(map).bindPopup("Starting Point");
            }
        }
    } else {
        // Set first point
        state.coordinates.push(currentCoords);
    }
    
    state.lastPosition = currentCoords;
    if (userMarker) userMarker.setLatLng(currentCoords);
    
    // Auto-center map on new steps
    if (map) {
        map.panTo(currentCoords);
    }
    
    // Recalculate average speed
    if (state.elapsedTime > 0) {
        state.avgSpeed = (state.distance / 1000) / (state.elapsedTime / 3600);
    }
    
    updateDashboard();
}

// GPS Errors
function handleGpsTrackingError(error) {
    console.error("GPS Watch Exception", error);
    updateGpsIndicator("offline", "Signal lost. Checking location...");
}

// Toggle Simulated walk function
function toggleSimulation() {
    if (state.isTracking && !state.isSimulating) {
        alert("Please stop current active tracking before simulating walking logs.");
        return;
    }
    
    if (state.isSimulating) {
        // Stop Simulation
        if (state.isTracking) {
            stopTracking();
        } else {
            state.isSimulating = false;
            clearInterval(state.simInterval);
            state.simInterval = null;
            elements.simulateBtn.classList.remove("btn-primary");
            elements.simulateBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Sim Walk';
            updateGpsIndicator("offline", "GPS Offline");
        }
        
    } else {
        // Start simulation modes
        state.isSimulating = true;
        elements.simulateBtn.classList.add("btn-primary");
        elements.simulateBtn.innerHTML = '<i class="fa-solid fa-stop"></i> Stop Sim';
        
        // Starting location
        if (navigator.geolocation) {
            updateGpsIndicator("searching", "Acquiring mock starting location...");
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    state.simLat = pos.coords.latitude;
                    state.simLng = pos.coords.longitude;
                    startSimTracking();
                },
                () => {
                    // Central Park NY coords default fallback
                    state.simLat = 40.7829;
                    state.simLng = -73.9654;
                    startSimTracking();
                }
            );
        } else {
            state.simLat = 40.7829;
            state.simLng = -73.9654;
            startSimTracking();
        }
    }
}

function startSimTracking() {
    if (map) {
        map.setView([state.simLat, state.simLng], 17);
        userMarker.setLatLng([state.simLat, state.simLng]);
    }
    
    updateGpsIndicator("online", "GPS Simulating Walk (Active)");
    
    // Auto initiate standard tracker metrics watch logic
    startTracking();
    
    // Start coordinate shift timers
    startSimulationTimer();
}

function startSimulationTimer() {
    state.simInterval = setInterval(() => {
        if (state.isPaused) return;
        
        // Simulating step length walking metrics (speed: ~4.7 km/h)
        // Adjust heading direction gradually to form a circular track walk trajectory
        state.simHeading += (Math.random() - 0.5) * 0.3; // Introduce minor directional changes
        
        // Approximate change: 1.3 meters delta equivalent in degrees coordinate offsets
        const meterDiff = 1.3;
        const latChange = (meterDiff * Math.cos(state.simHeading)) / 111320;
        const lngChange = (meterDiff * Math.sin(state.simHeading)) / (40075000 * Math.cos(state.simLat * Math.PI / 180) / 3600);
        
        state.simLat += latChange;
        state.simLng += lngChange;
        
        processPositionChange(state.simLat, state.simLng);
    }, 1000);
}

// Refresh metrics to Dashboard Panel view
function updateDashboard() {
    elements.stepsVal.innerText = state.steps.toLocaleString();
    
    const km = state.distance / 1000;
    elements.distanceVal.innerText = km.toFixed(2) + " km";
    elements.caloriesVal.innerText = Math.round(state.calories).toLocaleString();
    elements.timeVal.innerText = formatDuration(state.elapsedTime);
    
    // Show Speed (km/h)
    let speedToShow = 0;
    if (state.isTracking && !state.isPaused) {
        speedToShow = state.isSimulating ? 4.7 : state.currentSpeed;
    }
    elements.speedVal.innerHTML = speedToShow.toFixed(1) + ' <small>km/h</small>';
    
    // Show Pace (minutes/km)
    if (speedToShow > 0.5) {
        const paceMins = 60 / speedToShow;
        const mins = Math.floor(paceMins);
        const secs = Math.round((paceMins - mins) * 60);
        elements.paceVal.innerHTML = `${mins}:${secs.toString().padStart(2, '0')} <small>min/km</small>`;
    } else {
        elements.paceVal.innerHTML = '-- <small>min/km</small>';
    }
    
    // Update SVG Goal Ring progress
    const goal = state.profile.dailyGoal;
    const percentage = Math.min((state.steps / goal) * 100, 100);
    setProgress(percentage);
    
    // Dynamic recalculate of Weight planner during tracking active runs
    if (state.isTracking && state.elapsedTime % 10 === 0) {
        updateWeightLossEstimates();
    }
}

// SVG Circle fill manipulation function
function setProgress(percent) {
    const circle = elements.stepsProgressCircle;
    const radius = circle.r.baseVal.value;
    const circumference = radius * 2 * Math.PI;
    
    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    circle.style.strokeDashoffset = circumference - (percent / 100 * circumference);
}

// Time formattings
function formatDuration(totalSeconds) {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    
    if (hrs > 0) {
        return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Display past workouts
function renderHistory() {
    if (state.history.length === 0) {
        elements.historyContainer.innerHTML = `
            <div class="empty-history">
                <i class="fa-solid fa-person-walking"></i>
                <p>No tracks recorded yet. Start walking to build history!</p>
            </div>
        `;
        return;
    }
    
    elements.historyContainer.innerHTML = state.history.map(item => `
        <div class="history-card">
            <div class="history-top">
                <span class="history-date"><i class="fa-regular fa-calendar-check text-pulse" style="margin-right: 5px; color:#4facfe;"></i> ${item.date}</span>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <button class="history-share-btn" onclick="shareHistoryItem(${item.id})">
                        <i class="fa-solid fa-share-nodes"></i> Share
                    </button>
                    <span class="history-duration"><i class="fa-regular fa-clock" style="margin-right: 3px;"></i> ${item.duration}</span>
                </div>
            </div>
            <div class="history-metrics">
                <div class="history-metric">
                    <span class="history-metric-lbl">Steps</span>
                    <span class="history-metric-val">${item.steps.toLocaleString()}</span>
                </div>
                <div class="history-metric">
                    <span class="history-metric-lbl">Distance</span>
                    <span class="history-metric-val">${item.distance} <small>km</small></span>
                </div>
                <div class="history-metric">
                    <span class="history-metric-lbl">Calories</span>
                    <span class="history-metric-val" style="color: var(--accent-orange);">${item.calories} <small>kcal</small></span>
                </div>
                <div class="history-metric">
                    <span class="history-metric-lbl">Avg Speed</span>
                    <span class="history-metric-val">${item.avgSpeed} <small>km/h</small></span>
                </div>
            </div>
        </div>
    `).join('');
}

// Clear user history
function clearHistory() {
    if (confirm("Are you sure you want to clear your workout history?")) {
        state.history = [];
        localStorage.removeItem("geopace_history");
        renderHistory();
        speak("Workout history cleared");
    }
}

// Sharing Exporter Logic functions

// Open Share card Modal
function openShareModal(workout) {
    elements.shareDate.innerText = workout.date;
    elements.shareSteps.innerText = workout.steps.toLocaleString();
    elements.shareDistance.innerText = workout.distance + " km";
    elements.shareCalories.innerText = workout.calories + " kcal";
    elements.shareDuration.innerText = workout.duration;
    
    // Draw SVG map route trail
    renderSvgRoute(workout.coordinates || []);
    
    elements.shareModal.classList.add("active");
    speak("Preparing your workout share card");
}

function closeShareModal() {
    elements.shareModal.classList.remove("active");
}

// Global share click handler for past history logs
window.shareHistoryItem = function(id) {
    const workout = state.history.find(item => item.id === id);
    if (workout) {
        openShareModal(workout);
    }
};

// Scaling GPS path trace to beautiful responsive neon vector SVGs
function renderSvgRoute(coords) {
    const pathEl = elements.shareSvgPath;
    const startCircle = elements.shareSvgStart;
    const endCircle = elements.shareSvgEnd;
    const noRouteText = elements.shareNoRoute;
    
    if (!coords || coords.length < 2) {
        pathEl.setAttribute("d", "");
        startCircle.classList.add("hidden");
        endCircle.classList.add("hidden");
        noRouteText.classList.remove("hidden");
        return;
    }
    
    noRouteText.classList.add("hidden");
    
    // Width and height of share card map preview box
    const width = 300;
    const height = 180;
    const padding = 20;
    
    // Extract lat/lng coordinate extremes
    let lats = coords.map(c => c[0]);
    let lngs = coords.map(c => c[1]);
    
    let minLat = Math.min(...lats);
    let maxLat = Math.max(...lats);
    let minLng = Math.min(...lngs);
    let maxLng = Math.max(...lngs);
    
    // Prevent division by zero if straight lines or stationary positions
    let latRange = maxLat - minLat;
    let lngRange = maxLng - minLng;
    if (latRange === 0) latRange = 0.0001;
    if (lngRange === 0) lngRange = 0.0001;
    
    // Aspect ratios to fit path dynamically without stretch anomalies
    const mapScaleX = (width - padding * 2) / lngRange;
    const mapScaleY = (height - padding * 2) / latRange;
    const scale = Math.min(mapScaleX, mapScaleY);
    
    // Offsets to center route path vector inside bounds
    const offsetX = (width - lngRange * scale) / 2;
    const offsetY = (height - latRange * scale) / 2;
    
    // Map GPS points to local coordinates
    const points = coords.map(c => {
        const x = offsetX + (c[1] - minLng) * scale;
        // Invert Y axes because SVG origin starts top-left
        const y = height - (offsetY + (c[0] - minLat) * scale);
        return [x, y];
    });
    
    // Compile path sequence syntax string (e.g. M 10 20 L 30 40...)
    let pathD = `M ${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`;
    for (let i = 1; i < points.length; i++) {
        pathD += ` L ${points[i][0].toFixed(1)} ${points[i][1].toFixed(1)}`;
    }
    
    pathEl.setAttribute("d", pathD);
    
    // Mark Start (green dot) and End (red dot) locations on path trail
    const startPoint = points[0];
    const endPoint = points[points.length - 1];
    
    startCircle.setAttribute("cx", startPoint[0]);
    startCircle.setAttribute("cy", startPoint[1]);
    startCircle.classList.remove("hidden");
    
    endCircle.setAttribute("cx", endPoint[0]);
    endCircle.setAttribute("cy", endPoint[1]);
    endCircle.classList.remove("hidden");
}

// Convert HTML element to high-res PNG image blob
function getShareCardBlob() {
    return new Promise((resolve, reject) => {
        const target = document.getElementById("share-card-element");
        
        // Use html2canvas to render image representation
        html2canvas(target, {
            scale: 2, // High resolution density
            backgroundColor: null,
            useCORS: true,
            logging: false
        }).then(canvas => {
            canvas.toBlob(blob => {
                if (blob) {
                    resolve({ blob, canvas });
                } else {
                    reject(new Error("Blob compilation error"));
                }
            }, "image/png");
        }).catch(err => reject(err));
    });
}

// Invoke mobile-native Web Share sheets
function shareNative() {
    elements.shareNativeBtn.disabled = true;
    elements.shareNativeBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Preparing Share...';
    
    getShareCardBlob().then(({ blob }) => {
        const file = new File([blob], 'geopace_workout.png', { type: 'image/png' });
        
        // Check if browser native sharing is active and files sharing works
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            navigator.share({
                files: [file],
                title: 'My GeoPace Active Workout',
                text: `I just completed a run! Tracked with GeoPace App.`
            })
            .then(() => speak("Shared successfully"))
            .catch(err => console.log("Share canceled", err))
            .finally(() => {
                elements.shareNativeBtn.disabled = false;
                elements.shareNativeBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Share to Instagram / Apps';
            });
        } else {
            // Fallback download trigger if sharing files fails or lacks support
            elements.shareNativeBtn.disabled = false;
            elements.shareNativeBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Share to Instagram / Apps';
            alert("Direct file sharing is not supported by your current browser. Downloading file instead!");
            shareDownload();
        }
    }).catch(err => {
        console.error("Screenshot capture failed", err);
        elements.shareNativeBtn.disabled = false;
        elements.shareNativeBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Share to Instagram / Apps';
        alert("Could not generate share image. Try saving workout again.");
    });
}

// Download direct image file
function shareDownload() {
    elements.shareDownloadBtn.disabled = true;
    elements.shareDownloadBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating...';
    
    getShareCardBlob().then(({ canvas }) => {
        const url = canvas.toDataURL("image/png");
        const link = document.createElement("a");
        link.download = `geopace_workout_${Date.now()}.png`;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        speak("Workout card saved to your device downloads");
    })
    .catch(err => {
        console.error("Download failed", err);
        alert("Failed to render download image.");
    })
    .finally(() => {
        elements.shareDownloadBtn.disabled = false;
        elements.shareDownloadBtn.innerHTML = '<i class="fa-solid fa-download"></i> Save Image';
    });
}
