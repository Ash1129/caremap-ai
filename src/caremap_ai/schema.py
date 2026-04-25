"""Shared schema constants for CareMap AI.

The dataset is intentionally treated as noisy. These constants keep notebook,
Spark, and local demo code aligned on the exact source columns requested for
the hackathon.
"""

SOURCE_COLUMNS = [
    "name",
    "phone_numbers",
    "officialPhone",
    "email",
    "websites",
    "officialWebsite",
    "yearEstablished",
    "facebookLink",
    "twitterLink",
    "linkedinLink",
    "instagramLink",
    "address_line1",
    "address_line2",
    "address_line3",
    "address_city",
    "address_stateOrRegion",
    "address_zipOrPostcode",
    "address_country",
    "address_countryCode",
    "facilityTypeId",
    "operatorTypeId",
    "affiliationTypeIds",
    "description",
    "numberDoctors",
    "capacity",
    "specialties",
    "procedure",
    "equipment",
    "capability",
    "recency_of_page_update",
    "distinct_social_media_presence_count",
    "affiliated_staff_presence",
    "custom_logo_presence",
    "number_of_facts_about_the_organization",
    "post_metrics_most_recent_social_media_post_date",
    "post_metrics_post_count",
    "engagement_metrics_n_followers",
    "engagement_metrics_n_likes",
    "engagement_metrics_n_engagements",
    "latitude",
    "longitude",
]

TEXT_COLUMNS = ["description", "specialties", "procedure", "equipment", "capability"]

CAPABILITY_FIELDS = [
    "has_icu",
    "has_oxygen",
    "has_ventilator",
    "has_emergency_surgery",
    "has_anesthesiologist",
    "has_dialysis",
    "has_oncology",
    "has_trauma_care",
    "has_neonatal_care",
    "availability_24_7",
]

DOCTOR_AVAILABILITY_VALUES = {"full_time", "part_time", "visiting", "unknown"}

REGION_COLUMNS = ["state", "district_city", "pin_code"]
