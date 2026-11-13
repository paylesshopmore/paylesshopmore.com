"""Routes for the office's login activity page. Mounted at
/api/admin/login-activity/ by config/urls.py. See views.py."""

from django.urls import path

from . import views

urlpatterns = [
    path("", views.LoginActivityList.as_view(), name="login-activity"),
    path("stats/", views.Stats.as_view(), name="login-activity-stats"),
    path("map/", views.MapData.as_view(), name="login-activity-map"),
    path("suspicious/", views.Suspicious.as_view(), name="login-activity-suspicious"),
    path("suspicious/<int:pk>/review/", views.Review.as_view(), name="login-activity-review"),
    path("export/", views.Export.as_view(), name="login-activity-export"),
]
