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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.jetbrains.kmpapp.screens.feed.FeedScreen
import com.jetbrains.kmpapp.screens.home.HomeScreen
import com.jetbrains.kmpapp.screens.mypage.MyPageScreen
import com.jetbrains.kmpapp.screens.search.SearchScreen
import com.jetbrains.kmpapp.ui.components.KeypBottomBar
import com.jetbrains.kmpapp.ui.theme.KeypTheme

private const val HOME = "home"
private const val FEED = "feed"
private const val MYPAGE = "mypage"
private const val SEARCH = "search"

@Composable
fun App() = KeypTheme {
    val navController = rememberNavController()
    val snackbarHost = remember { SnackbarHostState() }
    var currentRoute by remember { mutableStateOf(HOME) }
    val tabRoute = currentRoute != SEARCH
    Scaffold(
        modifier = Modifier.fillMaxSize(),
        contentWindowInsets = WindowInsets(0),
        bottomBar = { if (tabRoute) KeypBottomBar(currentRoute) { route -> currentRoute = route; navController.navigate(route) { popUpTo(HOME) { inclusive = false }; launchSingleTop = true } } },
        snackbarHost = { SnackbarHost(snackbarHost) },
    ) { padding ->
        NavHost(
            navController,
            startDestination = HOME,
            modifier = Modifier.fillMaxSize().padding(padding).safeDrawingPadding(),
        ) {
            composable(HOME) { HomeScreen(onAddInterest = { currentRoute = SEARCH; navController.navigate(SEARCH) }) }
            composable(FEED) { FeedScreen() }
            composable(MYPAGE) { MyPageScreen(onManageInterests = { currentRoute = HOME; navController.navigate(HOME) { popUpTo(HOME) { inclusive = true } } }) }
            composable(SEARCH) { SearchScreen(onBack = { currentRoute = HOME; navController.popBackStack() }, onDone = { currentRoute = HOME; navController.popBackStack() }) }
        }
    }
}
