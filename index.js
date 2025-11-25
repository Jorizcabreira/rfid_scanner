import {AppRegistry} from 'react-native';
import App from 'App';
import {name as appName} from './app.json';

// Removed React Native Firebase - using Expo Notifications instead
// Background notifications handled by Expo Push Notifications and server.js

AppRegistry.registerComponent(appName, () => App);
