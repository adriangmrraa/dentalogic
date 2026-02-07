import os
import json
import logging
from datetime import datetime
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

logger = logging.getLogger(__name__)

# ==================== CONFIGURATION ====================
# The credentials can be a path to a file or a JSON string in environment variable
GOOGLE_CREDENTIALS_JSON = os.getenv("GOOGLE_CREDENTIALS")
# GOOGLE_CALENDAR_ID removed - now dynamic per professional

class GCalService:
    def __init__(self):
        self.service = self._authenticate()

    def _authenticate(self):
        """
        Authenticates with Google Calendar API using Service Account.
        """
        if not GOOGLE_CREDENTIALS_JSON:
            logger.warning("GOOGLE_CREDENTIALS not found in environment variables. GCal integration disabled.")
            return None

        try:
            # Parse the JSON string
            creds_info = json.loads(GOOGLE_CREDENTIALS_JSON)
            scopes = ['https://www.googleapis.com/auth/calendar']
            
            creds = service_account.Credentials.from_service_account_info(
                creds_info, scopes=scopes
            )
            return build('calendar', 'v3', credentials=creds)
        except Exception as e:
            logger.error(f"Error authenticating with Google Calendar: {e}")
            return None

    def list_events(self, calendar_id, time_min=None, time_max=None):
        """
        Lists events from the specified calendar.
        calendar_id: REQUIRED. The ID of the calendar to list events from.
        """
        if not self.service or not calendar_id:
            return []

        cal_id = calendar_id
        try:
            events_result = self.service.events().list(
                calendarId=cal_id,
                timeMin=time_min,
                timeMax=time_max,
                singleEvents=True,
                orderBy='startTime'
            ).execute()
            return events_result.get('items', [])
        except HttpError as error:
            logger.error(f"An error occurred: {error}")
            return []

    def create_event(self, calendar_id, summary, start_time, end_time, description=None):
        """
        Creates a new event in the specified calendar.
        calendar_id: REQUIRED.
        summary: Title of the event
        start_time: ISO format string (e.g., '2025-05-28T09:00:00Z')
        end_time: ISO format string
        """
        if not self.service or not calendar_id:
            return None

        cal_id = calendar_id
        event = {
            'summary': summary,
            'description': description,
            'start': {
                'dateTime': start_time,
                'timeZone': 'America/Argentina/Buenos_Aires',
            },
            'end': {
                'dateTime': end_time,
                'timeZone': 'America/Argentina/Buenos_Aires',
            },
        }

        try:
            event = self.service.events().insert(calendarId=cal_id, body=event).execute()
            logger.info(f"Event created: {event.get('htmlLink')}")
            return event
        except HttpError as error:
            logger.error(f"An error occurred while creating event: {error}")
            return None

    def delete_event(self, calendar_id, event_id):
        """
        Deletes an event from the specified calendar.
        calendar_id: REQUIRED.
        """
        if not self.service or not calendar_id:
            return False

        cal_id = calendar_id
        try:
            self.service.events().delete(calendarId=cal_id, eventId=event_id).execute()
            logger.info(f"Event deleted: {event_id}")
            return True
        except HttpError as error:
            logger.error(f"An error occurred while deleting event: {error}")
            return False

    def get_events_for_day(self, calendar_id, date_obj):
        """
        Fetches events for a specific day from Google Calendar API.
        This provides REAL-TIME data, bypassing local cache.
        date_obj: datetime.date or datetime object
        """
        if not self.service:
            return []
            
        try:
            # Create range for the full day (00:00 to 23:59:59)
            start_dt = datetime.combine(date_obj, datetime.min.time()).replace(tzinfo=None)
            end_dt = datetime.combine(date_obj, datetime.max.time()).replace(tzinfo=None)
            
            # Format to RFC3339 timestamp with Z suffix (UTC) or offset
            # Using simple ISO format and appending 'Z' for UTC/Zulu time which GCal expects
            time_min = start_dt.isoformat() + 'Z'
            time_max = end_dt.isoformat() + 'Z'
            
            return self.list_events(calendar_id=calendar_id, time_min=time_min, time_max=time_max)
        except Exception as e:
            logger.error(f"Error fetching daily events: {e}")
            return []

# Singleton instance
gcal_service = GCalService()
