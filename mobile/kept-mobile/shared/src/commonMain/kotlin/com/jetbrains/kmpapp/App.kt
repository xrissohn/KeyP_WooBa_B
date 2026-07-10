package com.jetbrains.kmpapp

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.jetbrains.kmpapp.screens.feed.FeedScreen
import com.jetbrains.kmpapp.screens.home.HomeScreen
import com.jetbrains.kmpapp.screens.bookmarks.BookmarksScreen
import com.jetbrains.kmpapp.screens.keyword.KeywordFeedScreen
import com.jetbrains.kmpapp.screens.search.SearchScreen
import com.jetbrains.kmpapp.screens.settings.NotificationSettingsScreen
import com.jetbrains.kmpapp.ui.components.KeypBottomBar
import com.jetbrains.kmpapp.ui.theme.KeypTheme

private const val HOME = "home"
private const val FEED = "feed"
private const val BOOKMARKS = "bookmarks"
private const val SEARCH = "search"
private const val SETTINGS = "settings"
private const val KEYWORD = "keyword/{subscriptionId}?keyword={keyword}"

@Composable
fun App() = KeypTheme {
    val navController = rememberNavController()
    val snackbarHost = remember { SnackbarHostState() }
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route ?: HOME
    val tabRoute = currentRoute != SEARCH && currentRoute != SETTINGS && currentRoute != KEYWORD
    Scaffold(
        modifier = Modifier.fillMaxSize(),
        contentWindowInsets = WindowInsets(0),
        bottomBar = { if (tabRoute) KeypBottomBar(currentRoute) { route -> navController.navigate(route) { popUpTo(HOME) { inclusive = false }; launchSingleTop = true } } },
        snackbarHost = { SnackbarHost(snackbarHost) },
    ) { padding ->
        NavHost(
            navController,
            startDestination = HOME,
            modifier = Modifier.fillMaxSize().padding(padding).safeDrawingPadding(),
        ) {
            composable(HOME) { HomeScreen(onAddInterest = { navController.navigate(SEARCH) }, onOpenSettings = { navController.navigate(SETTINGS) }, onOpenKeywordFeed = { id, keyword -> navController.navigate("keyword/$id?keyword=$keyword") }) }
            composable(FEED) { FeedScreen() }
            composable(BOOKMARKS) { BookmarksScreen() }
            composable(SEARCH) { SearchScreen(onBack = { navController.popBackStack() }, onDone = { navController.popBackStack() }) }
            composable(SETTINGS) { NotificationSettingsScreen(onBack = { navController.popBackStack() }) }
            composable(KEYWORD) { entry -> KeywordFeedScreen(entry.arguments?.getString("subscriptionId").orEmpty(), entry.arguments?.getString("keyword").orEmpty(), onBack = { navController.popBackStack() }) }
        }
    }
}
