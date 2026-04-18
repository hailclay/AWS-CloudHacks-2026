# Requirements Document

## Introduction

Trail Finder is an expansion of an existing React + Auth0 hiking app into a full-featured trail recommendation and social hiking platform, built for AWS CloudHacks 2026. The system learns each user's hiking preferences and uses AI-powered recommendations (Amazon Personalize + Amazon Bedrock) to surface the best matching trails nearby. Users can rate trails using a tier-based system (inspired by Beli), create and join hike meetup events, share posts from the trail, and discover environmental details about each hike. The backend runs entirely on AWS serverless infrastructure (Lambda, DynamoDB, S3) with Google Maps/Routes API for map features.

---

## Glossary

- **App**: The Trail Finder React + Vite frontend application.
- **User**: An authenticated person identified by their Auth0 `user.sub` ID.
- **Trail**: A hiking route with attributes including name, terrain type, difficulty, distance, elevation gain, and location coordinates.
- **Preference_Profile**: A User's stored set of hiking preferences (terrain, difficulty, distance, elevation, driving distance) persisted in DynamoDB.
- **Recommendation_Engine**: The AWS Lambda + Amazon Personalize service that scores and ranks Trails for a given User.
- **Bedrock_Agent**: The Amazon Bedrock AI agent that generates trail descriptions, environmental context, and wildlife information.
- **Trail_Rating**: A User's tier-based score (S, A, B, C, D) assigned to a Trail they have completed, stored in DynamoDB.
- **Hike_Event**: A scheduled group hike created by a User, associated with a Trail, with a date/time and an invite list.
- **Post**: A User-generated piece of content (photo, caption, wildlife sighting, or trail note) attached to a Trail or Hike_Event.
- **Feed**: The global stream of Posts from all Users, ranked so that Posts from Users the viewing User follows are surfaced first, with remaining Posts ordered by recency.
- **Map_View**: An interactive Google Maps embed showing Trail routes and nearby Trails.
- **Lambda_API**: The AWS Lambda function layer that serves as the backend API (no EC2).
- **S3_Store**: The Amazon S3 bucket used to store Trail data, images, and Post media.
- **Auth0**: The third-party authentication provider already integrated into the App.

---

## Requirements

### Requirement 1: User Preference Onboarding

**User Story:** As a new User, I want to set my hiking preferences after signing in for the first time, so that the App can immediately surface relevant trail recommendations.

#### Acceptance Criteria

1. WHEN a User completes authentication for the first time and no Preference_Profile exists, THE App SHALL display a multi-step onboarding flow before navigating to the Discover page.
2. THE onboarding flow SHALL collect the following preferences in order: terrain type (Mountain, Beach, Forest, Canyon, Desert), difficulty level (Easy, Medium, Hard), preferred trail distance in miles (numeric range 0.5–50), preferred elevation gain in feet (numeric range 0–10,000), and maximum driving distance in minutes (numeric range 5–180).
3. WHEN a User submits the onboarding form, THE Lambda_API SHALL persist the Preference_Profile to DynamoDB keyed by the User's Auth0 `user.sub` ID within 2 seconds.
4. IF the Lambda_API fails to save the Preference_Profile, THEN THE App SHALL display an error message and allow the User to retry without losing entered data.
5. WHEN a returning User navigates to the Profile page, THE App SHALL display the User's current Preference_Profile and provide an option to edit each preference field.
6. WHEN a User saves updated preferences, THE Lambda_API SHALL overwrite the existing Preference_Profile in DynamoDB and THE Recommendation_Engine SHALL re-rank the User's trail list within 5 seconds.

---

### Requirement 2: AI-Powered Trail Recommendations

**User Story:** As a User, I want to see a ranked list of trails that match my preferences, so that I can quickly find the best hike for my current goals.

#### Acceptance Criteria

1. WHEN a User opens the Discover page, THE Recommendation_Engine SHALL return a ranked list of at least 5 Trails ordered by match score for that User's Preference_Profile.
2. THE Recommendation_Engine SHALL use Amazon Personalize to compute match scores based on terrain type, difficulty, distance, elevation gain, and driving distance from the User's last known location.
3. WHEN the Recommendation_Engine returns results, THE App SHALL display each Trail card showing: rank number, trail name, terrain type, difficulty level, distance in miles, elevation gain in feet, community tier rating, and a match percentage.
4. THE App SHALL display a physical Map_View on the Discover page showing pins for all recommended Trails.
5. WHEN a User selects a Trail card, THE App SHALL navigate to a Trail Detail page showing full trail information, the Map_View with the route, the Bedrock_Agent-generated description, community ratings, and recent Posts.
6. IF the User's location cannot be determined, THEN THE App SHALL prompt the User to enter a ZIP code or city name to use as the origin for driving distance calculations.
7. WHEN a User's Preference_Profile is updated, THE Recommendation_Engine SHALL refresh the Discover page trail list without requiring a full page reload.

---

### Requirement 3: Trail Detail and Environmental Context

**User Story:** As a User, I want to read rich information about a trail including wildlife and environmental history, so that I can make an informed decision and feel connected to the natural area.

#### Acceptance Criteria

1. WHEN a User opens a Trail Detail page, THE App SHALL display the trail's name, terrain type, difficulty, distance, elevation gain, and a Google Maps route embed.
2. WHEN a Trail Detail page loads, THE Bedrock_Agent SHALL generate or retrieve a cached description of the trail's environmental history (up to 300 words) and display it on the page.
3. WHEN a Trail Detail page loads, THE Bedrock_Agent SHALL generate or retrieve a cached list of up to 10 wildlife species commonly observed on that trail, each with a common name and one-sentence description.
4. THE Lambda_API SHALL cache Bedrock_Agent responses in S3_Store so that repeated requests for the same Trail do not invoke Bedrock_Agent more than once per 24-hour period.
5. WHEN a User views the Trail Detail page, THE App SHALL display all Trail_Ratings submitted by other Users, grouped by tier (S, A, B, C, D) with a count per tier and the overall community tier label.

---

### Requirement 4: Trail Rating System

**User Story:** As a User, I want to rate trails I have completed using a tier system, so that I can share my experience and help others find great hikes.

#### Acceptance Criteria

1. WHEN a User selects a Trail and taps "Rate this trail", THE App SHALL display a tier selection interface with options S, A, B, C, and D, and an optional text review field (maximum 500 characters).
2. WHEN a User submits a Trail_Rating, THE Lambda_API SHALL store the rating in DynamoDB with the User's `user.sub`, Trail ID, tier value, optional review text, and a UTC timestamp.
3. THE Lambda_API SHALL enforce that each User may submit at most one Trail_Rating per Trail; WHEN a User submits a second rating for the same Trail, THE Lambda_API SHALL overwrite the previous rating.
4. WHEN a Trail_Rating is saved, THE Recommendation_Engine SHALL use the rating as an implicit feedback signal to improve future recommendations for that User.
5. THE App SHALL display the User's own rating on the Trail Detail page with an option to edit or delete it.
6. WHEN a User deletes a Trail_Rating, THE Lambda_API SHALL remove the record from DynamoDB within 2 seconds and THE App SHALL update the displayed community ratings without a full page reload.

---

### Requirement 5: Hike Events and Meetups

**User Story:** As a User, I want to create and join group hike events tied to specific trails, so that I can hike with friends and meet other hikers.

#### Acceptance Criteria

1. WHEN a User selects "Create Event" on a Trail Detail page, THE App SHALL display an event creation form collecting: event name, date and time, maximum group size (1–50), and an optional description (maximum 300 characters).
2. WHEN a User submits a new Hike_Event, THE Lambda_API SHALL persist the Hike_Event to DynamoDB with a unique event ID, the Trail ID, the organizer's `user.sub`, event details, and a UTC creation timestamp.
3. WHEN a Hike_Event is created, THE App SHALL allow the organizer to invite other Users by searching for their username or email address.
4. WHEN an invited User accepts a Hike_Event invitation, THE Lambda_API SHALL add the User's `user.sub` to the Hike_Event's attendee list in DynamoDB.
5. IF a Hike_Event has reached its maximum group size, THEN THE Lambda_API SHALL reject additional join requests and THE App SHALL display a "Event Full" status on the event card.
6. WHEN a User views the Events page, THE App SHALL display upcoming Hike_Events sorted by date, showing the trail name, event name, date/time, organizer name, and current attendee count.
7. WHEN the organizer cancels a Hike_Event, THE Lambda_API SHALL mark the event as cancelled in DynamoDB.

---

### Requirement 6: Social Feed and Trail Posts

**User Story:** As a User, I want to share photos, notes, and wildlife sightings from my hikes, so that I can contribute to the community and inspire others.

#### Acceptance Criteria

1. WHEN a User selects "Add Post" on a Trail Detail page or from an active Hike_Event, THE App SHALL display a post creation form accepting: an optional photo upload (JPEG or PNG, maximum 10 MB), a caption (maximum 280 characters), and an optional wildlife sighting tag (free-text, maximum 100 characters).
2. WHEN a User submits a Post with a photo, THE Lambda_API SHALL upload the photo to S3_Store and store the S3 object URL, caption, wildlife tag, Trail ID, optional Hike_Event ID, User `user.sub`, and UTC timestamp in DynamoDB.
3. WHEN a User submits a Post without a photo, THE Lambda_API SHALL store the caption, wildlife tag, Trail ID, optional Hike_Event ID, User `user.sub`, and UTC timestamp in DynamoDB.
4. THE App SHALL display a Feed page showing Posts from all Users globally, ranked so that Posts from Users the viewing User follows appear before Posts from other Users, and within each group sorted by UTC timestamp descending; each Post card SHALL show the author's display name, trail name, photo (if present), caption, wildlife tag (if present), and relative timestamp.
5. WHEN a User views a Trail Detail page, THE App SHALL display the 10 most recent Posts associated with that Trail below the environmental context section.
6. WHEN a User views a Hike_Event detail page, THE App SHALL display all Posts associated with that Hike_Event.
7. WHEN a User taps a wildlife sighting tag on any Post, THE App SHALL display a filtered view of all Posts on that Trail that share the same wildlife tag.
8. THE Lambda_API SHALL enforce that a User may only delete their own Posts; WHEN a User attempts to delete another User's Post, THE Lambda_API SHALL return a 403 error.

---

### Requirement 7: Map Integration

**User Story:** As a User, I want to see trails on an interactive map and get driving directions, so that I can plan my hike and navigate to the trailhead.

#### Acceptance Criteria

1. THE App SHALL embed a Google Maps map on both the Discover page (showing pins for all recommended Trails) and the Trail Detail page (showing the trail route polyline).
2. WHEN a User taps a trail pin on the Discover page map, THE App SHALL display a summary card for that Trail with a link to the Trail Detail page.
3. WHEN a User selects "Get Directions" on a Trail Detail page, THE App SHALL open Google Maps (web or native app) with the trailhead coordinates as the destination and the User's current location as the origin.
4. THE App SHALL display the estimated driving time and distance from the User's location to the trailhead on the Trail Detail page, using data from the existing trail dataset. Custom route generation via the Google Routes API is out of scope for the current version and is noted as a future enhancement.
5. IF the User's location permission is denied, THEN THE App SHALL fall back to using the ZIP code or city name entered during preference setup for driving distance calculations.

---

### Requirement 8: User Profile and Activity History

**User Story:** As a User, I want to view my hiking history, ratings, and upcoming events in one place, so that I can track my progress and manage my social activity.

#### Acceptance Criteria

1. WHEN a User navigates to the Profile page, THE App SHALL display the User's Auth0 profile picture, display name, and email address.
2. THE App SHALL display a "Trails Completed" count on the Profile page, calculated as the number of distinct Trails for which the User has submitted a Trail_Rating.
3. THE App SHALL display a list of the User's submitted Trail_Ratings on the Profile page, each showing the trail name, tier, and submission date, sorted by submission date descending.
4. THE App SHALL display a list of the User's upcoming Hike_Events on the Profile page, sorted by event date ascending.
5. THE App SHALL display a list of the User's Posts on the Profile page, sorted by UTC timestamp descending.
6. WHEN a User taps any Trail_Rating, Hike_Event, or Post on the Profile page, THE App SHALL navigate to the corresponding Trail Detail page, Hike_Event detail page, or Post detail view.

---

### Requirement 9: Backend API and Data Integrity

**User Story:** As a developer, I want all data operations to go through a secure, serverless Lambda API, so that the app scales without managing servers and user data is protected.

#### Acceptance Criteria

1. THE Lambda_API SHALL authenticate every request by validating the Auth0 JWT token in the `Authorization` header before processing any data operation.
2. IF a request arrives with an invalid or expired JWT token, THEN THE Lambda_API SHALL return a 401 HTTP response and SHALL NOT process the request.
3. THE Lambda_API SHALL enforce that Users may only read or modify their own Preference_Profile, Trail_Ratings, Hike_Events (as organizer), and Posts.
4. THE Lambda_API SHALL use DynamoDB for all structured data (Preference_Profiles, Trail_Ratings, Hike_Events, Posts, Trail metadata) and S3_Store for all binary assets (trail images, Post photos).
5. THE Lambda_API SHALL return all API responses in JSON format with a consistent envelope: `{ "success": boolean, "data": object | array | null, "error": string | null }`.
6. WHEN a DynamoDB write operation fails, THE Lambda_API SHALL return a 500 HTTP response with a descriptive error message and SHALL NOT leave partial data in DynamoDB.
7. THE Lambda_API SHALL enforce input validation on all endpoints; WHEN a request contains invalid or missing required fields, THE Lambda_API SHALL return a 400 HTTP response with a field-level error description.
